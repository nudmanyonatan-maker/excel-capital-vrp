import type { PayoutAccount, StaffUser } from "@/lib/types";
import { getPayoutAccount, listActivePayoutAccounts } from "@/lib/repo/payout-accounts";
import { unprotectString } from "@/lib/crypto";

/** "••••4321", enough to recognise an account without exposing it. */
export function maskAccount(value: string | null): string | null {
  return value ? `••••${value.replace(/\D/g, "").slice(-4)}` : null;
}

/** "••-••-56". */
export function maskSortCode(value: string | null): string | null {
  return value ? `••-••-${value.replace(/\D/g, "").slice(-2)}` : null;
}

/** One approved account, flattened and masked so it can be sent to the browser. */
export interface PayoutChoice {
  id: string;
  label: string;
  /** The name on the account, as the borrower's bank will show it. */
  name: string;
  masked: string;
}

export async function describePayoutAccount(
  account: PayoutAccount,
  encryptionKey: string,
): Promise<PayoutChoice> {
  const [acct, sort] = await Promise.all([
    unprotectString(account.account_number, encryptionKey),
    unprotectString(account.sort_code, encryptionKey),
  ]);
  return {
    id: account.id,
    label: account.label,
    name: account.name,
    masked: [maskAccount(acct), maskSortCode(sort)].filter(Boolean).join(" / "),
  };
}

/**
 * The accounts this person may send a borrower's repayments to.
 *
 * Decided on the server and nowhere else. The picker only shows what this
 * returns, and every action re-checks a submitted id with
 * choosePayoutAccount, because a form value is whatever the browser sends.
 */
export async function payoutChoicesFor(
  db: D1Database,
  _user: StaffUser,
  encryptionKey: string,
): Promise<PayoutChoice[]> {
  const accounts = await listActivePayoutAccounts(db);
  return Promise.all(accounts.map((a) => describePayoutAccount(a, encryptionKey)));
}

/**
 * Resolve the account a form asked for, refusing anything not on the approved
 * list. This is the check that stops a borrower's money being sent to an
 * account somebody typed in.
 */
export async function choosePayoutAccount(
  db: D1Database,
  _user: StaffUser,
  payoutAccountId: string | null | undefined,
): Promise<{ ok: true; account: PayoutAccount } | { ok: false; reason: string }> {
  const id = (payoutAccountId ?? "").trim();
  if (!id) {
    return { ok: false, reason: "Choose which account the repayments are paid into." };
  }
  const account = await getPayoutAccount(db, id);
  if (!account || account.archived_at) {
    return {
      ok: false,
      reason: "That account is not on the approved list any more. Choose another one.",
    };
  }
  return { ok: true, account };
}

/** The fields a borrower's own account row copies from an approved account. */
export function recipientFieldsFrom(account: PayoutAccount): {
  name: string;
  accountNumber: string;
  sortCode: string;
  payoutAccountId: string;
} {
  return {
    name: account.name,
    // Copied as stored, still encrypted. Identical ciphertext is also how
    // updateRecipient tells that an account did not actually change.
    accountNumber: account.account_number,
    sortCode: account.sort_code,
    payoutAccountId: account.id,
  };
}

/** Accounts typed in by hand before the list existed, grouped by account. */
export interface UnlinkedAccount {
  /**
   * Identifies the group in a form: the id of its first borrower account. Opaque
   * on purpose, since masked digits can collide and full digits must not leave
   * the server. The action regroups and finds the group holding this id.
   */
  key: string;
  name: string;
  masked: string;
  recipientIds: string[];
  borrowers: string[];
}

export async function groupUnlinkedAccounts(
  rows: {
    id: string;
    name: string;
    account_number: string | null;
    sort_code: string | null;
    legal_name: string;
  }[],
  encryptionKey: string,
): Promise<UnlinkedAccount[]> {
  const groups = new Map<string, UnlinkedAccount & { names: Map<string, number> }>();
  for (const row of rows) {
    const [acct, sort] = await Promise.all([
      unprotectString(row.account_number, encryptionKey),
      unprotectString(row.sort_code, encryptionKey),
    ]);
    const digits = `${(acct ?? "").replace(/\D/g, "")}:${(sort ?? "").replace(/\D/g, "")}`;
    if (digits === ":") continue;
    let group = groups.get(digits);
    if (!group) {
      group = {
        key: row.id,
        name: row.name,
        masked: [maskAccount(acct), maskSortCode(sort)].filter(Boolean).join(" / "),
        recipientIds: [],
        borrowers: [],
        names: new Map(),
      };
      groups.set(digits, group);
    }
    group.recipientIds.push(row.id);
    if (!group.borrowers.includes(row.legal_name)) group.borrowers.push(row.legal_name);
    group.names.set(row.name, (group.names.get(row.name) ?? 0) + 1);
  }
  return [...groups.values()].map(({ names, ...g }) => ({
    ...g,
    // The name most rows used, which is the one the business actually uses.
    name: [...names.entries()].sort((a, b) => b[1] - a[1])[0][0],
  }));
}
