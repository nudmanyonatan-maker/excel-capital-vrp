import Link from "next/link";
import { getDb } from "@/lib/db";
import { loadOverview, type Money } from "@/lib/repo/overview";
import { plainFailureReason } from "@/lib/overview";
import { formatMinor } from "@/lib/money";
import { InfoTip } from "@/components/info-tip";
import { TIPS } from "@/lib/help-text";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

const day = (iso: string) => dayFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
const date = (iso: string) => dateFmt.format(new Date(iso));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Card({
  label,
  money,
  unit = "payment",
  tip,
  tone = "slate",
  href,
}: {
  label: string;
  money: Money;
  unit?: string;
  tip?: string;
  tone?: "slate" | "emerald" | "red" | "sky";
  href?: string;
}) {
  const toneCls = {
    slate: "text-slate-900",
    emerald: "text-emerald-700",
    red: "text-red-700",
    sky: "text-sky-700",
  }[tone];
  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{formatMinor(money.minor)}</div>
      <div className="text-xs text-slate-500">{plural(money.count, unit)}</div>
    </>
  );
  const cls = "block rounded-lg border border-slate-200 bg-white p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-slate-300`}>
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
  title: string;
  tip?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
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
  <p className="text-sm text-slate-500">{children}</p>
);

/**
 * The high-level picture: what came in, what is due, and what needs someone.
 *
 * Every number here already existed somewhere, spread over one page per
 * borrower. Nothing on this page changes anything; each row links to the place
 * where it can be acted on.
 */
export default async function OverviewPage() {
  const o = await loadOverview(getDb());
  const maxMonth = Math.max(1, ...o.byMonth.map((m) => m.minor));
  const totalBorrowers = o.borrowers.active + o.borrowers.onboarding + o.borrowers.paused + o.borrowers.other;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Money in, money due, and what needs someone. Updated each time you open this page.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Collected this month" money={o.collected.thisMonth} tone="emerald" tip={TIPS.overviewCollected} />
        <Card label="Collected, last 7 days" money={o.collected.last7Days} tone="emerald" />
        <Card label="Due in the next 7 days" money={o.upcoming.total} unit="collection" tone="sky" tip={TIPS.overviewDue} />
        <Card
          label="Failed, not recovered"
          money={o.unrecovered.total}
          tone={o.unrecovered.total.count > 0 ? "red" : "slate"}
          tip={TIPS.overviewUnrecovered}
          href="/payments?group=problem"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card label="Collected today" money={o.collected.today} />
        <Card label="Being processed" money={o.inFlight} tip={TIPS.overviewInFlight} href="/payments" />
        <Card label="Collected all time" money={o.collected.allTime} />
        <Link
          href="/borrowers"
          className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Borrowers</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{totalBorrowers}</div>
          <div className="text-xs text-slate-500">
            {o.borrowers.active} active, {o.borrowers.onboarding} setting up, {o.borrowers.paused} paused
          </div>
        </Link>
      </div>

      {o.unknownCount > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {plural(o.unknownCount, "payment")} could not be confirmed with the bank yet. The system keeps
          checking them; see <Link href="/payments?status=unknown" className="underline">Payments</Link>.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="Failed and not recovered"
          tip={TIPS.overviewUnrecovered}
          action={
            <Link href="/payments?group=problem" className="text-sm text-slate-500 hover:underline">
              All problems
            </Link>
          }
        >
          {o.unrecovered.payments.length === 0 ? (
            <Empty>Nothing outstanding from the last 30 days.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.unrecovered.payments.slice(0, 10).map(({ payment, borrowerName }) => (
                <li key={payment.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/borrowers/${payment.borrower_id}`} className="font-medium text-slate-900 hover:underline">
                      {borrowerName}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {date(payment.created_at)}: {plainFailureReason(payment.failure_reason)}
                    </div>
                  </div>
                  <div className="shrink-0 font-medium text-red-700">{formatMinor(payment.amount_minor)}</div>
                </li>
              ))}
              {o.unrecovered.payments.length > 10 && (
                <li className="pt-2 text-xs text-slate-500">
                  and {o.unrecovered.payments.length - 10} more on the Payments page.
                </li>
              )}
            </ul>
          )}
        </Panel>

        <Panel title="Coming up, next 7 days" tip={TIPS.overviewDue}>
          {o.upcoming.days.length === 0 ? (
            <Empty>No collections due in the next 7 days.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.upcoming.days.map((d) => (
                <li key={d.date} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{day(d.date)}</span>
                    <span className="font-medium text-sky-700">{formatMinor(d.totalMinor)}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {d.items
                      .map((i) => `${i.borrowerName} ${formatMinor(i.amountMinor)}`)
                      .join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Waiting on setup" tip={TIPS.overviewWaiting}>
        {o.waiting.length === 0 ? (
          <Empty>Every borrower has finished setup.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Borrower</th>
                  <th className="pb-2 font-medium">Waiting on</th>
                  <th className="pb-2 font-medium">Setup link</th>
                  <th className="pb-2 font-medium">Onboarded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.waiting.map((w) => {
                  const expired = w.linkExpiresAt != null && w.linkExpiresAt < new Date().toISOString();
                  return (
                    <tr key={w.borrowerId}>
                      <td className="py-2 pr-3">
                        <Link href={`/borrowers/${w.borrowerId}`} className="font-medium text-slate-900 hover:underline">
                          {w.name}
                        </Link>
                        {w.lastFailureAt && (
                          <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
                            Last attempt failed {date(w.lastFailureAt)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3" title={w.detail}>
                        {w.whose === "borrower" ? (
                          <span className="text-amber-700">Them</span>
                        ) : (
                          <span className="text-red-700">Us</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {!w.linkSentAt
                          ? "Not sent"
                          : expired
                            ? <span className="text-red-700">Expired {date(w.linkExpiresAt!)}, send a new one</span>
                            : `Sent ${date(w.linkSentAt)}, valid until ${date(w.linkExpiresAt!)}`}
                      </td>
                      <td className="py-2 text-slate-600">{date(w.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Collected by month">
          <ul className="space-y-2">
            {o.byMonth.map((m) => (
              <li key={m.month} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-sm">
                <span className="text-slate-600">{monthFmt.format(new Date(`${m.month}-01T00:00:00Z`))}</span>
                <span className="h-2.5 rounded-full bg-slate-100">
                  <span
                    className="block h-2.5 rounded-full bg-emerald-500"
                    style={{ width: `${(m.minor / maxMonth) * 100}%` }}
                  />
                </span>
                <span className="text-right font-medium text-slate-900">{formatMinor(m.minor)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Mandates ending in the next 30 days">
          {o.endingSoon.length === 0 ? (
            <Empty>None. Mandates with no end date never appear here.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.endingSoon.map((e) => (
                <li key={e.borrowerId} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/borrowers/${e.borrowerId}`} className="font-medium text-slate-900 hover:underline">
                    {e.name}
                  </Link>
                  <span className="text-amber-700">Ends {date(e.validTo)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
