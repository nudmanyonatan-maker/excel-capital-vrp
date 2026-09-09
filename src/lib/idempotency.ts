/**
 * Idempotency keys for payment execution.
 *
 * The contract that prevents double-collection:
 *  - A scheduled auto-collection produces a DETERMINISTIC key from
 *    (borrower, schedule, the date it is FOR). If the cron double-fires, or a
 *    manual run races the cron for the same due date, both compute the same key
 *    and the DB's UNIQUE(idempotency_key) rejects the second INSERT.
 *  - A genuine retry of a failed payment gets a NEW key (includes attempt #), so
 *    it is allowed as a distinct attempt.
 *  - A manual "execute now" gets a unique key (includes a nonce).
 *
 * Keys are readable (easier to debug/reconcile) and stay well under Plaid's limit.
 */

const MAX_LEN = 128;

function clamp(key: string): string {
  if (key.length > MAX_LEN) throw new Error(`idempotency key too long: ${key.length}`);
  return key;
}

/** Deterministic key for a scheduled collection due on a specific date. */
export function scheduledKey(
  borrowerId: string,
  scheduleId: string,
  dueDate: string, // YYYY-MM-DD
): string {
  return clamp(`sch_${borrowerId}_${scheduleId}_${dueDate}`);
}

/** Key for retry attempt N (1-based) of an original payment. */
/**
 * The one key for retrying one failed attempt.
 *
 * Keyed on the attempt being replaced, not on a count of attempts so far. The
 * count was read separately from the query that selected the failure, so two
 * overlapping sweeps could straddle each other's insert: the second read a
 * count that had just increased, derived a higher attempt number, and produced a
 * DIFFERENT key for the same failure. The UNIQUE(idempotency_key) guard then had
 * nothing to catch and the instalment went out twice.
 *
 * Deriving it from failedPaymentId makes that impossible by construction. Two
 * runs retrying the same failure always agree on the key whatever order they
 * interleave in, and a genuine second retry replaces a different row (the first
 * retry, once it too has failed) so it still gets a key of its own.
 */
export function retryKey(failedPaymentId: string): string {
  return clamp(`rty1_${failedPaymentId}`);
}

/** Unique key for a manual one-off execution. `nonce` should be a UUID. */
export function manualKey(borrowerId: string, nonce: string): string {
  return clamp(`man_${borrowerId}_${nonce}`);
}
