import type { PayoutAccount } from "@/lib/types";
import { newId } from "@/lib/ids";

/** Accounts staff can choose from today, in the order they appear in pickers. */
export async function listActivePayoutAccounts(db: D1Database): Promise<PayoutAccount[]> {
  const { results } = await db
    .prepare("SELECT * FROM payout_accounts WHERE archived_at IS NULL ORDER BY label COLLATE NOCASE")
    .all<PayoutAccount>();
  return results ?? [];
}

/** Every account ever approved, retired ones last, for the admin's list. */
export async function listAllPayoutAccounts(db: D1Database): Promise<PayoutAccount[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM payout_accounts
        ORDER BY archived_at IS NOT NULL, label COLLATE NOCASE`,
    )
    .all<PayoutAccount>();
  return results ?? [];
}

export async function getPayoutAccount(db: D1Database, id: string): Promise<PayoutAccount | null> {
  return db.prepare("SELECT * FROM payout_accounts WHERE id = ?").bind(id).first<PayoutAccount>();
}

/** Account details must already be encrypted by the caller. */
export async function createPayoutAccount(
  db: D1Database,
  data: {
    label: string;
    name: string;
    accountNumber: string;
    sortCode: string;
    createdBy: string | null;
  },
): Promise<PayoutAccount> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO payout_accounts (id, label, name, account_number, sort_code, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, data.label, data.name, data.accountNumber, data.sortCode, data.createdBy)
    .run();
  return (await getPayoutAccount(db, id))!;
}

/**
 * Take an account off the picker. Borrowers already paying into it are not
 * touched: their mandates are agreed with their bank and keep working.
 */
export async function archivePayoutAccount(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE payout_accounts SET archived_at = ? WHERE id = ? AND archived_at IS NULL")
    .bind(new Date().toISOString(), id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Borrower accounts entered by hand before the approved list existed. */
export async function listUnlinkedRecipients(db: D1Database): Promise<
  {
    id: string;
    name: string;
    account_number: string | null;
    sort_code: string | null;
    legal_name: string;
  }[]
> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.name, r.account_number, r.sort_code, b.legal_name
         FROM recipients r JOIN borrowers b ON b.id = r.borrower_id
        WHERE r.payout_account_id IS NULL AND r.archived_at IS NULL
        ORDER BY r.created_at`,
    )
    .all<{
      id: string;
      name: string;
      account_number: string | null;
      sort_code: string | null;
      legal_name: string;
    }>();
  return results ?? [];
}

/**
 * Record that these borrower accounts are the approved account. Only rows not
 * already linked, so a second click can never move a row between accounts.
 */
export async function linkRecipientsToPayoutAccount(
  db: D1Database,
  recipientIds: string[],
  payoutAccountId: string,
): Promise<number> {
  if (recipientIds.length === 0) return 0;
  const placeholders = recipientIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `UPDATE recipients SET payout_account_id = ?
        WHERE payout_account_id IS NULL AND id IN (${placeholders})`,
    )
    .bind(payoutAccountId, ...recipientIds)
    .run();
  return result.meta.changes ?? 0;
}
