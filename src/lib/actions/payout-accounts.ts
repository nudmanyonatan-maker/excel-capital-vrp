"use server";

import { revalidatePath } from "next/cache";
import { getDb, getEnv } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/repo/audit";
import { protectString, unprotectString } from "@/lib/crypto";
import { parseAccountDetails, MAX_RECIPIENT_NAME } from "@/lib/borrower-setup-input";
import {
  archivePayoutAccount,
  createPayoutAccount,
  linkRecipientsToPayoutAccount,
  listActivePayoutAccounts,
  listUnlinkedRecipients,
} from "@/lib/repo/payout-accounts";
import { groupUnlinkedAccounts } from "@/lib/payout-accounts";
import type { PayoutAccount } from "@/lib/types";

export type PayoutAccountState = { error?: string; saved?: string } | null;

const MAX_LABEL = 40;

/** An approved account already holding these digits, if any. */
async function findByDigits(
  db: D1Database,
  key: string,
  accountNumber: string,
  sortCode: string,
): Promise<PayoutAccount | null> {
  for (const account of await listActivePayoutAccounts(db)) {
    const [acct, sort] = await Promise.all([
      unprotectString(account.account_number, key),
      unprotectString(account.sort_code, key),
    ]);
    if (acct === accountNumber && sort === sortCode) return account;
  }
  return null;
}

/**
 * Approve a new account for repayments to be paid into. Admins only: this list
 * is the whole of where borrower money can go, so adding to it is the one act
 * that must never be open to everyone who can onboard a borrower.
 */
export async function addPayoutAccountAction(
  _prev: PayoutAccountState,
  fd: FormData,
): Promise<PayoutAccountState> {
  const user = await requireRole("admin");
  const db = getDb();
  const env = getEnv();

  const label = String(fd.get("label") ?? "").trim();
  if (!label) return { error: "Give the account a name staff will recognise, like Excel Capital." };
  if (label.length > MAX_LABEL) return { error: `Keep the name to ${MAX_LABEL} characters or fewer.` };

  const parsed = parseAccountDetails({
    recipientName: String(fd.get("recipientName") ?? ""),
    accountNumber: String(fd.get("accountNumber") ?? ""),
    sortCode: String(fd.get("sortCode") ?? ""),
  });
  if (!parsed.value) return { error: parsed.errors.join(" ") };
  const v = parsed.value;

  const duplicate = await findByDigits(db, env.APP_ENCRYPTION_KEY, v.accountNumber, v.sortCode);
  if (duplicate) return { error: `That account is already on the list as "${duplicate.label}".` };

  const created = await createPayoutAccount(db, {
    label,
    name: v.recipientName,
    accountNumber: (await protectString(v.accountNumber, env.APP_ENCRYPTION_KEY))!,
    sortCode: (await protectString(v.sortCode, env.APP_ENCRYPTION_KEY))!,
    createdBy: user.id,
  });
  await writeAudit(db, {
    actorStaffId: user.id,
    action: "payout_account.add",
    entityType: "payout_account",
    entityId: created.id,
    metadata: { label, last4: v.accountNumber.slice(-4) },
  });
  revalidatePath("/settings");
  return { saved: `${label} added. Staff can now choose it when onboarding a borrower.` };
}

/** Take an account off the picker. Existing borrowers keep paying into it. */
export async function archivePayoutAccountAction(
  _prev: PayoutAccountState,
  fd: FormData,
): Promise<PayoutAccountState> {
  const user = await requireRole("admin");
  const db = getDb();
  const id = String(fd.get("payoutAccountId") ?? "");
  if (!id) return { error: "Something went wrong: no account was selected." };

  if (!(await archivePayoutAccount(db, id))) {
    return { error: "That account was already removed from the list." };
  }
  await writeAudit(db, {
    actorStaffId: user.id,
    action: "payout_account.archive",
    entityType: "payout_account",
    entityId: id,
  });
  revalidatePath("/settings");
  return {
    saved:
      "Removed from the list. Borrowers already paying into it are not affected, but nobody can choose it for a new borrower.",
  };
}

/**
 * Put an account that borrowers already pay into onto the approved list.
 *
 * Before the list existed, account details were typed in per borrower. This
 * adopts one of those as an approved account, copying the stored details rather
 * than asking anyone to retype them, so the list cannot disagree by a typo with
 * where existing borrowers' money already goes.
 */
export async function adoptExistingAccountAction(
  _prev: PayoutAccountState,
  fd: FormData,
): Promise<PayoutAccountState> {
  const user = await requireRole("admin");
  const db = getDb();
  const env = getEnv();

  const key = String(fd.get("groupKey") ?? "");
  const label = String(fd.get("label") ?? "").trim();
  const name = String(fd.get("recipientName") ?? "").trim();
  if (!label) return { error: "Give the account a name staff will recognise, like Excel Capital." };
  if (label.length > MAX_LABEL) return { error: `Keep the name to ${MAX_LABEL} characters or fewer.` };
  if (!name || name.length > MAX_RECIPIENT_NAME) {
    return {
      error: `The name on the account must be 1 to ${MAX_RECIPIENT_NAME} characters, or some banks refuse it.`,
    };
  }

  // Regroup on the server rather than trusting ids from the form, so this can
  // only ever link rows that genuinely hold the same account.
  const rows = await listUnlinkedRecipients(db);
  const groups = await groupUnlinkedAccounts(rows, env.APP_ENCRYPTION_KEY);
  const group = groups.find((g) => g.key === key);
  if (!group) return { error: "Those accounts have already been added. Refresh the page." };

  const source = rows.find((r) => r.id === group.recipientIds[0])!;
  const [acct, sort] = await Promise.all([
    unprotectString(source.account_number, env.APP_ENCRYPTION_KEY),
    unprotectString(source.sort_code, env.APP_ENCRYPTION_KEY),
  ]);
  const accountNumber = (acct ?? "").replace(/\D/g, "");
  const sortCode = (sort ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(accountNumber) || !/^\d{6}$/.test(sortCode)) {
    return { error: "These stored details are incomplete, so they cannot be approved. Add the account by hand instead." };
  }

  const account =
    (await findByDigits(db, env.APP_ENCRYPTION_KEY, accountNumber, sortCode)) ??
    (await createPayoutAccount(db, {
      label,
      name,
      accountNumber: (await protectString(accountNumber, env.APP_ENCRYPTION_KEY))!,
      sortCode: (await protectString(sortCode, env.APP_ENCRYPTION_KEY))!,
      createdBy: user.id,
    }));
  const linked = await linkRecipientsToPayoutAccount(db, group.recipientIds, account.id);

  await writeAudit(db, {
    actorStaffId: user.id,
    action: "payout_account.adopt",
    entityType: "payout_account",
    entityId: account.id,
    metadata: { label: account.label, linked },
  });
  revalidatePath("/settings");
  return {
    saved: `${account.label} is on the list, and ${linked} existing borrower account${linked === 1 ? " is" : "s are"} linked to it.`,
  };
}
