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

export interface Period {
  /** As it appears in the URL: "month", "last-month", "7d", "30d", "90d", "year", "all" or "YYYY-MM". */
  key: string;
  label: string;
  /** Inclusive YYYY-MM-DD bounds. */
  from: string;
  to: string;
  /** The period just before, of the same length, to compare against. Null for "all". */
  prevFrom: string | null;
  prevTo: string | null;
  prevLabel: string | null;
}

export const PERIOD_CHOICES: { key: string; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastDayOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function monthBefore(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/**
 * Turn the period chosen on the Overview into dates. Anything unrecognised,
 * including a month that has not happened yet, means this month: the value
 * comes from the URL, so it is treated as untrusted.
 */
export function resolvePeriod(key: string | undefined, today: string): Period {
  const thisMonth = today.slice(0, 7);
  const days = { "7d": 7, "30d": 30, "90d": 90 }[key ?? ""];
  if (days) {
    const from = shift(today, -(days - 1));
    return {
      key: key!,
      label: `Last ${days} days`,
      from,
      to: today,
      prevFrom: shift(from, -days),
      prevTo: shift(from, -1),
      prevLabel: `the ${days} days before`,
    };
  }
  if (key === "all") {
    return { key, label: "All time", from: "0000-01-01", to: today, prevFrom: null, prevTo: null, prevLabel: null };
  }
  if (key === "year") {
    const year = today.slice(0, 4);
    const prevYear = String(Number(year) - 1);
    return {
      key,
      label: `This year`,
      from: `${year}-01-01`,
      to: today,
      prevFrom: `${prevYear}-01-01`,
      prevTo: `${prevYear}${today.slice(4)}`,
      prevLabel: `the same point in ${prevYear}`,
    };
  }
  const month =
    key === "last-month" ? monthBefore(thisMonth) : key && /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && key < thisMonth ? key : null;
  if (month) {
    const prev = monthBefore(month);
    return {
      key: key!,
      label: key === "last-month" ? "Last month" : monthName(month),
      from: `${month}-01`,
      to: lastDayOf(month),
      prevFrom: `${prev}-01`,
      prevTo: lastDayOf(prev),
      prevLabel: monthName(prev),
    };
  }
  // This month so far, against the same days of last month (clamped to its end).
  const prev = monthBefore(thisMonth);
  const sameDay = `${prev}-${today.slice(8)}`;
  return {
    key: "month",
    label: "This month",
    from: `${thisMonth}-01`,
    to: today,
    prevFrom: `${prev}-01`,
    prevTo: sameDay > lastDayOf(prev) ? lastDayOf(prev) : sameDay,
    prevLabel: `the same days of ${monthName(prev)}`,
  };
}

/** Whole-percent change from `before` to `now`, or null when there is nothing to compare. */
export function percentChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}
