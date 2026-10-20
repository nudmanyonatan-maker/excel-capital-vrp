import Link from "next/link";
import { getDb } from "@/lib/db";
import { AHEAD_CHOICES, loadOverview, type Money, type WaitingBorrower } from "@/lib/repo/overview";
import { lastMonths, PERIOD_CHOICES, plainFailureReason } from "@/lib/overview";
import { formatMinor } from "@/lib/money";
import { InfoTip } from "@/components/info-tip";
import { ParamSelect } from "@/components/param-select";
import { TIPS } from "@/lib/help-text";

export const dynamic = "force-dynamic";

const utc = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts });
const dayLabel = (iso: string) => fmt({ weekday: "short", day: "numeric", month: "short" }).format(utc(iso));
const shortDate = (iso: string) => fmt({ day: "numeric", month: "short" }).format(utc(iso));
const monthShort = (month: string) => fmt({ month: "short", year: "numeric" }).format(utc(`${month}-01`));
const ukTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const daysBetween = (fromIso: string, to: string) =>
  Math.max(0, Math.floor((utc(to).getTime() - utc(fromIso.slice(0, 10)).getTime()) / 86_400_000));

const WAITING_FILTERS = [
  { key: "all", label: "All" },
  { key: "them", label: "Waiting on them" },
  { key: "us", label: "Waiting on us" },
  { key: "expired", label: "Link expired" },
] as const;
type WaitingFilter = (typeof WAITING_FILTERS)[number]["key"];

function matchesWaiting(w: WaitingBorrower, filter: WaitingFilter, nowIso: string): boolean {
  if (filter === "them") return w.whose === "borrower";
  if (filter === "us") return w.whose === "staff";
  if (filter === "expired") return w.linkExpiresAt != null && w.linkExpiresAt < nowIso;
  return true;
}

/** Money in a fixed-width figure style, so columns of amounts line up. */
function Amount({ minor, className = "" }: { minor: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatMinor(minor)}</span>;
}

function Stat({
  label,
  tip,
  href,
  value,
  sub,
  tone = "default",
  children,
}: {
  label: string;
  tip?: string;
  href?: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "info";
  children?: React.ReactNode;
}) {
  const toneCls = {
    default: "text-slate-900",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-red-700",
    info: "text-sky-700",
  }[tone];
  const body = (
    <>
      <div className="flex items-center text-sm text-slate-500">
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      {children}
    </>
  );
  const cls = "block rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-slate-300 hover:shadow`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Panel({
  title,
  tip,
  action,
  children,
}: {
  title: React.ReactNode;
  tip?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center text-base font-semibold text-slate-900">
          {title}
          {tip && <InfoTip text={tip} />}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{children}</p>
);

function Change({
  change,
  against,
  previousMinor,
}: {
  change: number | null;
  against: string | null;
  previousMinor: number | null;
}) {
  if (!against || previousMinor == null) return null;
  // A percentage off a tiny base reads as nonsense ("up 33822%" on a GBP 30
  // test month), so past a point say what it was instead.
  if (change == null || Math.abs(change) > 500) {
    return (
      <span className="text-slate-500">
        {previousMinor === 0 ? "Nothing" : formatMinor(previousMinor)} in {against}
      </span>
    );
  }
  const up = change >= 0;
  return (
    <span className={`font-medium ${up ? "text-emerald-700" : "text-red-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(change)}%{" "}
      <span className="font-normal text-slate-500">vs {against}</span>
    </span>
  );
}

/**
 * The high-level picture: what came in, what is due, and what needs someone.
 *
 * Read-only. Every number links to the page where it can be acted on, and the
 * period, the look-ahead and the setup filter all live in the URL, so any view
 * can be bookmarked or sent to a colleague.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; ahead?: string; waiting?: string }>;
}) {
  const sp = await searchParams;
  const o = await loadOverview(getDb(), new Date(), {
    period: sp.period,
    aheadDays: Number(sp.ahead) || undefined,
  });
  const { period } = o.inPeriod;
  // "Collected, last month" but "Collected, September 2026": month names keep their capital.
  const periodPhrase = /^\d{4}-\d{2}$/.test(period.key) ? period.label : period.label.toLowerCase();
  const nowIso = o.generatedAt;
  const waitingFilter: WaitingFilter = WAITING_FILTERS.some((f) => f.key === sp.waiting)
    ? (sp.waiting as WaitingFilter)
    : "all";
  const waitingShown = o.waiting.filter((w) => matchesWaiting(w, waitingFilter, nowIso));
  const maxMonth = Math.max(1, ...o.byMonth.map((m) => m.minor));
  const maxTop = Math.max(1, ...o.inPeriod.topBorrowers.map((t) => t.minor));
  const owedTotal: Money = o.unrecovered.total;
  const totalBorrowers = o.borrowers.active + o.borrowers.onboarding + o.borrowers.paused + o.borrowers.other;
  const range = period.key === "all" ? "" : `&from=${period.from}&to=${period.to}`;
  const pastMonths = lastMonths(o.today, 24).slice(0, -1).reverse();
  // Links that change one setting keep the others.
  const withParam = (name: string, value: string) => {
    const next = new URLSearchParams();
    if (sp.period) next.set("period", sp.period);
    if (sp.ahead) next.set("ahead", sp.ahead);
    if (sp.waiting) next.set("waiting", sp.waiting);
    next.set(name, value);
    return `/overview?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Updated {ukTime(nowIso)} UK time. Refresh the page for the latest.
          </p>
        </div>
        <ParamSelect
          name="period"
          label="Showing"
          value={period.key}
          groups={[
            { label: "Periods", options: PERIOD_CHOICES.map((c) => ({ value: c.key, label: c.label })) },
            { label: "A past month", options: pastMonths.map((m) => ({ value: m, label: monthShort(m) })) },
          ]}
        />
      </div>

      {/* The chosen period. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Collected, ${periodPhrase}`}
          tip={TIPS.overviewCollected}
          href={`/payments?status=executed${range}`}
          value={formatMinor(o.inPeriod.collected.minor)}
          tone="good"
          sub={
            <span className="flex flex-wrap gap-x-2">
              <span>{plural(o.inPeriod.collected.count, "payment")}</span>
              <Change
                change={o.inPeriod.change}
                against={o.inPeriod.period.prevLabel}
                previousMinor={o.inPeriod.previous?.minor ?? null}
              />
            </span>
          }
        />
        <Stat
          label="Went through"
          tip={TIPS.overviewSuccessRate}
          value={o.inPeriod.successRate == null ? "None yet" : `${o.inPeriod.successRate}%`}
          tone={
            o.inPeriod.successRate == null
              ? "default"
              : o.inPeriod.successRate >= 90
                ? "good"
                : o.inPeriod.successRate >= 75
                  ? "warn"
                  : "bad"
          }
          sub={`${o.inPeriod.collected.count} of ${o.inPeriod.collected.count + o.inPeriod.failed.count} attempts`}
        />
        <Stat
          label={`Failed, ${periodPhrase}`}
          href={`/payments?group=problem${range}`}
          value={formatMinor(o.inPeriod.failed.minor)}
          tone={o.inPeriod.failed.count > 0 ? "bad" : "default"}
          sub={plural(o.inPeriod.failed.count, "payment")}
        />
        <Stat
          label={`Due in the next ${o.aheadDays} days`}
          tip={TIPS.overviewDue}
          value={formatMinor(o.upcoming.total.minor)}
          tone="info"
          sub={plural(o.upcoming.total.count, "collection")}
        />
      </div>

      {/* Right now, whatever the period. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected today" value={formatMinor(o.collected.today.minor)} sub={plural(o.collected.today.count, "payment")} />
        <Stat
          label="Being processed"
          tip={TIPS.overviewInFlight}
          href="/payments?status=initiated"
          value={formatMinor(o.inFlight.minor)}
          sub={plural(o.inFlight.count, "payment")}
        />
        <Stat
          label="Still owed"
          tip={TIPS.overviewUnrecovered}
          href="#owed"
          value={formatMinor(owedTotal.minor)}
          tone={owedTotal.count > 0 ? "bad" : "default"}
          sub={`${plural(o.owedByBorrower.length, "borrower")}, last 30 days`}
        />
        <Stat
          label="Borrowers"
          href="/borrowers"
          value={totalBorrowers}
          sub={`${o.borrowers.active} active, ${o.borrowers.onboarding} setting up, ${o.borrowers.paused} paused`}
        />
      </div>

      {o.unknownCount > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {plural(o.unknownCount, "payment")} could not be confirmed with the bank yet. The system keeps checking;
          see <Link href="/payments?status=unknown" className="font-medium underline">Payments</Link>.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div id="owed" className="scroll-mt-6">
          <Panel
            title="Still owed from failed payments"
            tip={TIPS.overviewUnrecovered}
            action={
              <Link href="/payments?group=problem" className="text-sm font-medium text-slate-600 hover:underline">
                All problems
              </Link>
            }
          >
            {o.owedByBorrower.length === 0 ? (
              <Empty>Nothing outstanding from the last 30 days.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {o.owedByBorrower.map((g) => (
                  <li key={g.borrowerId}>
                    <details className="group py-1">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 py-2 hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{g.name}</span>
                          <span className="text-xs text-slate-500">
                            {plural(g.payments.length, "failed payment")}, last {shortDate(g.payments[0].created_at)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Amount minor={g.totalMinor} className="font-semibold text-red-700" />
                          <span aria-hidden className="text-slate-400 transition group-open:rotate-90">›</span>
                        </span>
                      </summary>
                      <ul className="mb-2 ml-1 space-y-1 border-l-2 border-slate-100 pl-3">
                        {g.payments.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-slate-600">
                              {shortDate(p.created_at)}: {plainFailureReason(p.failure_reason)}
                            </span>
                            <Amount minor={p.amount_minor} className="text-slate-700" />
                          </li>
                        ))}
                        <li>
                          <Link href={`/borrowers/${g.borrowerId}`} className="text-sm font-medium text-slate-900 underline">
                            Open borrower to retry
                          </Link>
                        </li>
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title="Coming up"
          tip={TIPS.overviewDue}
          action={
            <ParamSelect
              name="ahead"
              label="Next"
              value={String(o.aheadDays)}
              options={AHEAD_CHOICES.map((d) => ({ value: String(d), label: `${d} days` }))}
            />
          }
        >
          {o.upcoming.days.length === 0 ? (
            <Empty>No collections due in the next {o.aheadDays} days.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.upcoming.days.map((d) => (
                <li key={d.date}>
                  <details className="group py-1">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 py-2 hover:bg-slate-50">
                      <span>
                        <span className="font-medium text-slate-900">{dayLabel(d.date)}</span>
                        <span className="ml-2 text-xs text-slate-500">{plural(d.items.length, "borrower")}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Amount minor={d.totalMinor} className="font-semibold text-sky-700" />
                        <span aria-hidden className="text-slate-400 transition group-open:rotate-90">›</span>
                      </span>
                    </summary>
                    <ul className="mb-2 ml-1 space-y-1 border-l-2 border-slate-100 pl-3">
                      {d.items.map((i) => (
                        <li key={i.borrowerId} className="flex items-center justify-between gap-3 text-sm">
                          <Link href={`/borrowers/${i.borrowerId}`} className="truncate text-slate-700 hover:underline">
                            {i.borrowerName}
                          </Link>
                          <Amount minor={i.amountMinor} className="text-slate-700" />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Waiting on setup" tip={TIPS.overviewWaiting}>
        <div className="mb-3 flex flex-wrap gap-2">
          {WAITING_FILTERS.map((f) => {
            const count = o.waiting.filter((w) => matchesWaiting(w, f.key, nowIso)).length;
            const active = f.key === waitingFilter;
            return (
              <Link
                key={f.key}
                href={withParam("waiting", f.key)}
                scroll={false}
                className={`rounded-full border px-3 py-1 text-sm font-medium ${
                  active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {f.label} <span className={active ? "text-slate-300" : "text-slate-400"}>{count}</span>
              </Link>
            );
          })}
        </div>
        {waitingShown.length === 0 ? (
          <Empty>{o.waiting.length === 0 ? "Every borrower has finished setup." : "Nobody in this group."}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {waitingShown.map((w) => {
              const expired = w.linkExpiresAt != null && w.linkExpiresAt < nowIso;
              return (
                <li key={w.borrowerId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <Link href={`/borrowers/${w.borrowerId}`} className="font-medium text-slate-900 hover:underline">
                      {w.name}
                    </Link>
                    <div className="text-xs text-slate-500" title={w.detail}>
                      Waiting {plural(daysBetween(w.createdAt, o.today), "day")} since onboarding
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {w.whose === "borrower" ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">On them</span>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">On us</span>
                    )}
                    {w.lastFailureAt && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                        Bank connection failed {shortDate(w.lastFailureAt)}
                      </span>
                    )}
                    <span className={expired ? "font-medium text-red-700" : "text-slate-500"}>
                      {!w.linkSentAt
                        ? "No link sent yet"
                        : expired
                          ? `Link expired ${shortDate(w.linkExpiresAt!)}, send a new one`
                          : `Link valid until ${shortDate(w.linkExpiresAt!)}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={`Top borrowers, ${periodPhrase}`}>
          {o.inPeriod.topBorrowers.length === 0 ? (
            <Empty>Nothing collected in this period.</Empty>
          ) : (
            <ol className="space-y-3">
              {o.inPeriod.topBorrowers.map((t, i) => (
                <li key={t.borrowerId}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/borrowers/${t.borrowerId}`} className="truncate text-slate-800 hover:underline">
                      <span className="mr-2 text-slate-400 tabular-nums">{i + 1}</span>
                      {t.name}
                    </Link>
                    <Amount minor={t.minor} className="font-medium text-slate-900" />
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${(t.minor / maxTop) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Collected by month" action={<span className="text-xs text-slate-500">Click a month to open it</span>}>
          <ul className="space-y-1">
            {o.byMonth.map((m) => {
              const selected = period.key === m.month || (period.key === "month" && m.month === o.today.slice(0, 7));
              return (
                <li key={m.month}>
                  <Link
                    href={withParam("period", m.month === o.today.slice(0, 7) ? "month" : m.month)}
                    scroll={false}
                    className={`grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-3 rounded-md px-1 py-1 text-sm hover:bg-slate-50 ${
                      selected ? "bg-slate-50 font-medium" : ""
                    }`}
                  >
                    <span className="text-slate-600">{monthShort(m.month)}</span>
                    <span className="h-2 rounded-full bg-slate-100">
                      <span
                        className={`block h-2 rounded-full ${selected ? "bg-emerald-600" : "bg-emerald-400"}`}
                        style={{ width: `${(m.minor / maxMonth) * 100}%` }}
                      />
                    </span>
                    <Amount minor={m.minor} className="text-right text-slate-900" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {o.endingSoon.length > 0 && (
        <Panel title="Mandates ending in the next 30 days">
          <ul className="divide-y divide-slate-100">
            {o.endingSoon.map((e) => (
              <li key={e.borrowerId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/borrowers/${e.borrowerId}`} className="font-medium text-slate-900 hover:underline">
                  {e.name}
                </Link>
                <span className="text-amber-700">Ends {shortDate(e.validTo)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
