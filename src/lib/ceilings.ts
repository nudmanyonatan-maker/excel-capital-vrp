/**
 * Suggested mandate ceilings for a repayment.
 *
 * The period ceiling must cover every collection that can fall inside ONE
 * period, so it depends on which period was chosen. This used to assume a
 * month whatever was picked: with Year selected it proposed one month's worth
 * as the whole year's ceiling, and the borrower's bank would have started
 * refusing repayments a few months in.
 *
 * Counts are deliberately the most that can land in a period (five Mondays in
 * a month, 53 in a year), plus the 20% per payment, so a late fee still fits.
 */
const COLLECTIONS_PER_PERIOD: Record<string, Record<string, number>> = {
  DAY: { daily: 1, weekly: 1, fortnightly: 1, monthly: 1, custom: 1 },
  WEEK: { daily: 7, weekly: 1, fortnightly: 1, monthly: 1, custom: 7 },
  MONTH: { daily: 31, weekly: 5, fortnightly: 3, monthly: 1, custom: 31 },
  YEAR: { daily: 366, weekly: 53, fortnightly: 27, monthly: 12, custom: 366 },
};

export const PERIOD_WORDS: Record<string, string> = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

export function suggestCeilings(
  repaymentMajor: number,
  frequency: string,
  period: string,
): { single: number; periodic: number; collections: number; period: string } {
  const p = COLLECTIONS_PER_PERIOD[period] ? period : "MONTH";
  // 20% headroom, rounded up to the nearest £10.
  const single = Math.ceil((repaymentMajor * 1.2) / 10) * 10;
  // Room for one extra payment, such as a late fee, on top of the schedule.
  const collections = (COLLECTIONS_PER_PERIOD[p][frequency] ?? COLLECTIONS_PER_PERIOD[p].custom) + 1;
  return { single, periodic: single * collections, collections, period: p };
}
