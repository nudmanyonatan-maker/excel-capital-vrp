import { listBorrowers } from "@/lib/repo/borrowers";
import { listDestinationsForBorrowers } from "@/lib/repo/destinations";
import { collectionProgress } from "@/lib/repo/payments";
import { toSpec } from "@/lib/repo/schedules";
import { SETUP_FAILED_ACTION } from "@/lib/repo/audit";
import { setupProgress } from "@/lib/setup-progress";
import { lastMonths, projectCollections } from "@/lib/overview";
import type { Payment, RepaymentSchedule } from "@/lib/types";

/**
 * Everything the Overview page shows, in one read.
 *
 * "Collected" means executed or settled, the same as a loan's own progress
 * (SETTLED_ONLY in repo/payments). Archived borrowers are left out throughout:
 * the overview is about the book being worked now.
 */

export interface Money {
  count: number;
  minor: number;
}

export interface UnrecoveredPayment {
  payment: Payment;
  borrowerName: string;
}

export interface UpcomingDay {
  date: string;
  items: { borrowerId: string; borrowerName: string; amountMinor: number }[];
  totalMinor: number;
}

export interface WaitingBorrower {
  borrowerId: string;
  name: string;
  /** Whose move it is: the borrower approving, or staff finishing the details. */
  whose: "borrower" | "staff";
  detail: string;
  linkSentAt: string | null;
  linkExpiresAt: string | null;
  /** Their most recent failed attempt to connect, if it came after the last link. */
  lastFailureAt: string | null;
  createdAt: string;
}

export interface EndingMandate {
  borrowerId: string;
  name: string;
  validTo: string;
}

export interface Overview {
  today: string;
  collected: { today: Money; last7Days: Money; thisMonth: Money; allTime: Money };
  inFlight: Money;
  byMonth: { month: string; minor: number; count: number }[];
  unrecovered: { total: Money; payments: UnrecoveredPayment[] };
  unknownCount: number;
  upcoming: { total: Money; days: UpcomingDay[] };
  borrowers: { active: number; onboarding: number; paused: number; other: number };
  waiting: WaitingBorrower[];
  endingSoon: EndingMandate[];
}

const COLLECTED = "'executed','settled'";
const IN_FLIGHT = "'pending','unknown','submitted','initiated'";
/** How far back an unrecovered failure is still worth chasing from here. */
const UNRECOVERED_DAYS = 30;
const UPCOMING_DAYS = 7;
const ENDING_SOON_DAYS = 30;

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function money(row: { n: number | null; m: number | null } | null): Money {
  return { count: row?.n ?? 0, minor: row?.m ?? 0 };
}

export async function loadOverview(db: D1Database, now: Date = new Date()): Promise<Overview> {
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const months = lastMonths(today, 6);

  const live = "borrower_id IN (SELECT id FROM borrowers WHERE deleted_at IS NULL)";
  const sumSince = (since: string) =>
    db
      .prepare(
        `SELECT COUNT(*) AS n, SUM(amount_minor) AS m FROM payments
          WHERE status IN (${COLLECTED}) AND substr(created_at, 1, 10) >= ? AND ${live}`,
      )
      .bind(since)
      .first<{ n: number; m: number | null }>();

  const [todayRow, weekRow, monthRow, allRow, inFlightRow, monthRows, unknownRow] =
    await Promise.all([
      sumSince(today),
      sumSince(shiftDays(today, -(UPCOMING_DAYS - 1))),
      sumSince(monthStart),
      sumSince("0000-00-00"),
      db
        .prepare(
          `SELECT COUNT(*) AS n, SUM(amount_minor) AS m FROM payments
            WHERE status IN (${IN_FLIGHT}) AND ${live}`,
        )
        .first<{ n: number; m: number | null }>(),
      db
        .prepare(
          `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n, SUM(amount_minor) AS m
             FROM payments
            WHERE status IN (${COLLECTED}) AND substr(created_at, 1, 7) >= ? AND ${live}
            GROUP BY month`,
        )
        .bind(months[0])
        .all<{ month: string; n: number; m: number }>(),
      db
        .prepare(`SELECT COUNT(*) AS n FROM payments WHERE status = 'unknown' AND ${live}`)
        .first<{ n: number }>(),
    ]);

  const perMonth = new Map((monthRows.results ?? []).map((r) => [r.month, r]));
  const byMonth = months.map((month) => ({
    month,
    minor: perMonth.get(month)?.m ?? 0,
    count: perMonth.get(month)?.n ?? 0,
  }));

  const borrowers = await listBorrowers(db, {});
  const nameById = new Map(borrowers.map((b) => [b.id, b.legal_name]));

  // A failure still owed: the latest attempt in its retry chain failed, and no
  // attempt in that chain was ever collected. Same chain rule as auto-retry
  // (root = retry_of ?? id), so a failure the retry later recovered drops off.
  const unrecoveredRows = await db
    .prepare(
      `SELECT p.* FROM payments p
        WHERE p.status IN ('failed','rejected')
          AND substr(p.created_at, 1, 10) >= ?
          AND p.${live}
          AND NOT EXISTS (
            SELECT 1 FROM payments q
             WHERE COALESCE(q.retry_of, q.id) = COALESCE(p.retry_of, p.id)
               AND (q.created_at > p.created_at
                    OR (q.created_at = p.created_at AND q.id > p.id)
                    OR q.status IN (${COLLECTED}))
          )
        ORDER BY p.created_at DESC`,
    )
    .bind(shiftDays(today, -UNRECOVERED_DAYS))
    .all<Payment>();
  const unrecovered = (unrecoveredRows.results ?? []).map((payment) => ({
    payment,
    borrowerName: nameById.get(payment.borrower_id) ?? "Unknown borrower",
  }));

  // Only borrowers collections will actually run for: paused ones are skipped
  // by the nightly run, so counting them would promise money that is not coming.
  const activeIds = new Set(borrowers.filter((b) => b.status === "active").map((b) => b.id));
  const { results: schedules } = await db
    .prepare("SELECT * FROM repayment_schedules WHERE active = 1 AND next_run_date IS NOT NULL")
    .all<RepaymentSchedule>();
  const collectable = (schedules ?? []).filter((s) => activeIds.has(s.borrower_id));
  const projected = projectCollections(
    await Promise.all(
      collectable.map(async (s) => {
        const progress = await collectionProgress(db, s.borrower_id, s.id);
        return {
          key: s.borrower_id,
          spec: toSpec(s),
          nextRunDate: s.next_run_date,
          ...progress,
        };
      }),
    ),
    today,
    UPCOMING_DAYS,
  );
  const days = new Map<string, UpcomingDay>();
  for (const run of projected) {
    const day = days.get(run.date) ?? { date: run.date, items: [], totalMinor: 0 };
    day.items.push({
      borrowerId: run.key,
      borrowerName: nameById.get(run.key) ?? "Unknown borrower",
      amountMinor: run.amountMinor,
    });
    day.totalMinor += run.amountMinor;
    days.set(run.date, day);
  }

  const counts = { active: 0, onboarding: 0, paused: 0, other: 0 };
  for (const b of borrowers) {
    if (b.status === "active" || b.status === "onboarding" || b.status === "paused") counts[b.status]++;
    else counts.other++;
  }

  // Whose move it is, from the same rules as the Borrowers list.
  const destinations = await listDestinationsForBorrowers(db, borrowers.map((b) => b.id));
  const [links, failures] = await Promise.all([
    db
      .prepare(
        `SELECT s.borrower_id, s.created_at, s.expires_at FROM setup_links s
          WHERE s.created_at = (SELECT MAX(t.created_at) FROM setup_links t WHERE t.borrower_id = s.borrower_id)`,
      )
      .all<{ borrower_id: string; created_at: string; expires_at: string }>(),
    db
      .prepare(
        `SELECT entity_id, MAX(created_at) AS at FROM audit_log
          WHERE action = ? AND entity_type = 'borrower' GROUP BY entity_id`,
      )
      .bind(SETUP_FAILED_ACTION)
      .all<{ entity_id: string; at: string }>(),
  ]);
  const linkBy = new Map((links.results ?? []).map((l) => [l.borrower_id, l]));
  const failureBy = new Map((failures.results ?? []).map((f) => [f.entity_id, f.at]));

  const waiting: WaitingBorrower[] = [];
  for (const b of borrowers) {
    if (b.status === "paused") continue;
    const progress = setupProgress(destinations.get(b.id) ?? []);
    if (progress.complete || progress.total === 0) continue;
    if (progress.awaitingBorrower === 0 && progress.needsStaff === 0) continue;
    const link = linkBy.get(b.id) ?? null;
    const failedAt = failureBy.get(b.id) ?? null;
    waiting.push({
      borrowerId: b.id,
      name: b.legal_name,
      whose: progress.needsStaff > 0 ? "staff" : "borrower",
      detail: progress.detail,
      linkSentAt: link?.created_at ?? null,
      linkExpiresAt: link?.expires_at ?? null,
      lastFailureAt: failedAt && (!link || failedAt > link.created_at) ? failedAt : null,
      createdAt: b.created_at,
    });
  }
  waiting.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const endingRows = await db
    .prepare(
      `SELECT borrower_id, MIN(valid_to) AS valid_to FROM consents
        WHERE status = 'authorized' AND valid_to IS NOT NULL
          AND substr(valid_to, 1, 10) >= ? AND substr(valid_to, 1, 10) <= ?
        GROUP BY borrower_id ORDER BY valid_to`,
    )
    .bind(today, shiftDays(today, ENDING_SOON_DAYS))
    .all<{ borrower_id: string; valid_to: string }>();
  const endingSoon = (endingRows.results ?? [])
    .filter((r) => nameById.has(r.borrower_id))
    .map((r) => ({ borrowerId: r.borrower_id, name: nameById.get(r.borrower_id)!, validTo: r.valid_to }));

  return {
    today,
    collected: {
      today: money(todayRow),
      last7Days: money(weekRow),
      thisMonth: money(monthRow),
      allTime: money(allRow),
    },
    inFlight: money(inFlightRow),
    byMonth,
    unrecovered: {
      total: {
        count: unrecovered.length,
        minor: unrecovered.reduce((sum, u) => sum + u.payment.amount_minor, 0),
      },
      payments: unrecovered,
    },
    unknownCount: unknownRow?.n ?? 0,
    upcoming: {
      total: {
        count: projected.length,
        minor: projected.reduce((sum, r) => sum + r.amountMinor, 0),
      },
      days: [...days.values()],
    },
    borrowers: counts,
    waiting,
    endingSoon,
  };
}
