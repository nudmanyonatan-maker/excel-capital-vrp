import { newId } from "@/lib/ids";
import type { PaymentIntent, PaymentIntentKind } from "@/lib/types";

export async function createOrGetPaymentIntent(
  db: D1Database,
  data: {
    id?: string;
    borrowerId: string;
    scheduleId?: string | null;
    kind: PaymentIntentKind;
    amountMinor: number;
    currency: string;
    reference: string;
    idempotencyKey: string;
    createdBy: string | null;
    expiresAt: string;
  },
): Promise<PaymentIntent> {
  const id = data.id ?? newId();
  await db
    .prepare(
      `INSERT OR IGNORE INTO payment_intents
        (id, borrower_id, schedule_id, kind, amount_minor, currency, reference,
         idempotency_key, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      data.borrowerId,
      data.scheduleId ?? null,
      data.kind,
      data.amountMinor,
      data.currency,
      data.reference,
      data.idempotencyKey,
      data.createdBy,
      data.expiresAt,
    )
    .run();

  const intent = await db
    .prepare("SELECT * FROM payment_intents WHERE idempotency_key = ?")
    .bind(data.idempotencyKey)
    .first<PaymentIntent>();
  if (!intent) throw new Error("failed to create payment intent");
  if (
    intent.borrower_id !== data.borrowerId ||
    intent.amount_minor !== data.amountMinor ||
    intent.currency !== data.currency
  ) {
    throw new Error("idempotency key reused with different payment parameters");
  }
  return intent;
}

export async function setPaymentIntentExecuting(
  db: D1Database,
  intentId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE payment_intents
       SET status = 'executing', updated_at = ?
       WHERE id = ? AND status = 'prepared'`,
    )
    .bind(new Date().toISOString(), intentId)
    .run();
}

export async function completePaymentIntent(
  db: D1Database,
  intentId: string,
  paymentId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE payment_intents
       SET status = 'completed', payment_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(paymentId, new Date().toISOString(), intentId)
    .run();
}

/**
 * Pence this person has started collecting since a moment, across every
 * borrower. For a sales rep that is their £1 tests, which is all they can send.
 * Cancelled intents never reached the bank, so they do not count.
 */
export async function amountStartedBySince(
  db: D1Database,
  staffId: string,
  sinceIso: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM payment_intents
        WHERE created_by = ? AND created_at >= ? AND status <> 'cancelled'`,
    )
    .bind(staffId, sinceIso)
    .first<{ total: number }>();
  return row?.total ?? 0;
}
