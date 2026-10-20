import { amountForRun, isEnded, nextRunDate, type ScheduleSpec } from "@/lib/schedule";

/**
 * The arithmetic behind the Overview page. Pure, so the numbers it promises can
 * be tested without a database.
 */

export interface ScheduleToProject {
  /** Carried through to each projected run, so the caller can say whose it is. */
  key: string;
  spec: ScheduleSpec;
  /** As stored on the schedule; null means nothing is due. */
  nextRunDate: string | null;
  /** Progress so far, counting payments still in flight, as the nightly run does. */
  paymentsMade: number;
  collectedMinor: number;
}

export interface ProjectedRun {
  key: string;
  date: string;
  amountMinor: number;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Every collection the nightly run will attempt from `today` for `days` days.
 *
 * Follows the same calendar as the nightly run (nextRunDate walks from the
 * start date), and assumes each run succeeds, so a schedule that ends by count
 * or by total stops inside the window exactly when it would. A run already
 * overdue is shown as due today, because that is when it will next be tried.
 */
export function projectCollections(
  schedules: ScheduleToProject[],
  today: string,
  days: number,
): ProjectedRun[] {
  const lastDay = addDays(today, days - 1);
  const runs: ProjectedRun[] = [];

  for (const s of schedules) {
    if (!s.nextRunDate) continue;
    let date: string | null = s.nextRunDate < today ? today : s.nextRunDate;
    let paymentsMade = s.paymentsMade;
    let collectedMinor = s.collectedMinor;

    while (date && date <= lastDay) {
      if (isEnded(s.spec, { paymentsMade, collectedMinor, onDate: date })) break;
      const amountMinor = amountForRun(s.spec, collectedMinor);
      if (amountMinor <= 0) break;
      runs.push({ key: s.key, date, amountMinor });
      paymentsMade++;
      collectedMinor += amountMinor;
      date = nextRunDate(s.spec, { afterDate: date, paymentsMade, collectedMinor });
    }
  }

  return runs.sort((a, b) => a.date.localeCompare(b.date));
}

/** The last `count` months as YYYY-MM, oldest first, ending with `today`'s month. */
export function lastMonths(today: string, count: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

/**
 * Why a payment failed, in words. The stored reason is the bank's status code,
 * which reads as noise to anyone who is not a developer.
 */
export function plainFailureReason(reason: string | null | undefined): string {
  if (!reason) return "No reason given";
  if (reason.includes("INSUFFICIENT_FUNDS")) return "Not enough money in their account";
  if (reason.includes("BLOCKED")) return "Blocked by their bank";
  if (reason.includes("REJECTED")) return "Refused by their bank";
  if (reason.includes("FAILED")) return "Failed at their bank";
  return reason.length > 80 ? `${reason.slice(0, 77)}...` : reason;
}
