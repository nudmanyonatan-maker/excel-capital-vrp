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

/**
 * Characters Plaid accepts in an idempotency key.
 *
 * Learned the hard way: a retry key was built with a "#" separator and Plaid
 * refused the payment outright with "invalid idempotency key", which reaches an
 * operator as a collection that simply will not go, with nothing naming the
 * character as the cause. The keys are ours to choose, so there is no reason to
 * use anything outside the set every provider agrees on.
 */
const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

function clamp(key: string): string {
  if (key.length > MAX_LEN) throw new Error(`idempotency key too long: ${key.length}`);
  if (!SAFE_KEY.test(key)) {
    throw new Error(`idempotency key has characters a provider may reject: ${key}`);
  }
  return key;
}

/** Deterministic key for a scheduled collection due on a specific date. */
export function scheduledKey(
  borrowerId: string,
  scheduleId: string,
  dueDate: string, // YYYY-MM-DD
  /**
   * How many earlier attempts at this instalment the provider refused outright,
   * creating nothing. Zero for the ordinary case, and the key is then exactly
   * what it has always been.
   *
   * A key is idempotent at PLAID too, not only in our own table, and Plaid
   * remembers it with the parameters it was first used with. So a GBP 0.01
   * collection refused for being under their GBP 1.00 minimum burned that day's
   * key: correcting the amount and trying again reused it with a different
   * amount, and Plaid answered "idempotency key reused with different payment
   * parameters". Freeing the key on our side was necessary and not sufficient,
   * because their copy is the one that refuses.
   *
   * So a corrected attempt gets its own key. Still deterministic, so two runs of
   * the same attempt still collide and cannot double-charge; it only moves on
   * when we have proof the provider created nothing. See
   * releaseUnsentIdempotencyKey, which is what counts these.
   */
  unsentAttempts = 0,
): string {
  const base = `sch_${borrowerId}_${scheduleId}_${dueDate}`;
  return clamp(unsentAttempts > 0 ? `${base}_r${unsentAttempts + 1}` : base);
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
