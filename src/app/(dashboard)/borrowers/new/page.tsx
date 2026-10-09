import Link from "next/link";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { BorrowerCreateForm } from "@/components/borrower-create-form";

import { WeekdayPicker } from "@/components/weekday-picker";
import { CompanyLookup } from "@/components/company-lookup";
import { CeilingSuggester } from "@/components/ceiling-suggester";
import { isCompaniesHouseConfigured } from "@/lib/companies-house";
import { getDb, getEnv } from "@/lib/db";
import { payoutChoicesFor } from "@/lib/payout-accounts";
import { PayoutAccountSelect } from "@/components/payout-account-select";
import { InfoTip } from "@/components/info-tip";
import { TIPS } from "@/lib/help-text";

export const dynamic = "force-dynamic";

function Field({
  label,
  name,
  type = "text",
  placeholder,
  help,
  required,
  defaultValue,
  tip,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  defaultValue?: string;
  tip?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
        {tip && <InfoTip text={tip} />}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        step={type === "number" ? "0.01" : undefined}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
      />
      {help && <span className="mt-0.5 block text-xs text-slate-400">{help}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function NewBorrowerPage() {
  // Sales reps and up, matching createBorrowerAction. A viewer could otherwise
  // fill the whole form in and lose it on submit.
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "sales")) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href="/borrowers" className="text-sm text-slate-500 hover:underline">
          ← Borrowers
        </Link>
        <p className="mt-4 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          You have view-only access, so you cannot add a borrower.
        </p>
      </div>
    );
  }

  // Only offer the register lookup when an API key is configured; otherwise the
  // form is plain manual entry.
  const canSchedule = hasRole(user, "operator");
  const env = getEnv();
  const companiesHouseReady = isCompaniesHouseConfigured(env);
  const payoutChoices = await payoutChoicesFor(getDb(), user, env.APP_ENCRYPTION_KEY);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link href="/borrowers" className="text-sm text-slate-500 hover:underline">
          ← Borrowers
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Onboard borrower</h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture the business, where repayments are sent, the schedule, and the
          intended VRP consent limits. Consent limits are applied when the borrower
          authorises via Plaid.
        </p>
      </div>

      <BorrowerCreateForm className="space-y-5">
        <Section title="Business">
          {companiesHouseReady && <CompanyLookup />}
          <Field label="Legal name" name="legalName" required placeholder="Acme Trading Ltd" tip={TIPS.legalName} />
          <Field label="Company number" name="companyNumber" placeholder="12345678" tip={TIPS.companyNumber} />
          <Field label="Contact email" name="contactEmail" type="email" tip={TIPS.contactEmail} />
          <Field label="Contact phone" name="contactPhone" tip={TIPS.contactPhone} />
        </Section>

        <Section title="Where repayments come from">
          <Field
            label="Business account number"
            name="payerAccount"
            required
            placeholder="12345678"
            help="The borrower's business account, not a personal one."
            tip={TIPS.payerAccount}
          />
          <Field label="Business sort code" name="payerSort" required placeholder="12-34-56" tip={TIPS.payerAccount} />
        </Section>

        <Section title="Where repayments go">
          <PayoutAccountSelect choices={payoutChoices} tip={TIPS.payoutAccount} />
        </Section>

        {/* Schedules are for the accounts team. A sales rep sets the borrower up;
            the action ignores schedule fields from them anyway. */}
        {canSchedule && (
        <Section title="Repayment schedule">
          <Field label="Amount (£)" name="amount" type="number" required placeholder="500.00" tip={TIPS.amount} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Frequency
              <InfoTip text={TIPS.frequency} />
            </span>
            <select
              name="frequency"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="daily">Daily (choose which days below)</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom (every N days)</option>
            </select>
          </label>
          <div className="col-span-2">
            <WeekdayPicker selected={null} />
          </div>
          <Field label="Interval days (custom only)" name="intervalDays" type="number" tip={TIPS.intervalDays} />
          <Field label="Start date" name="startDate" type="date" required tip={TIPS.startDate} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              End mode
              <InfoTip text={TIPS.endMode} />
            </span>
            <select
              name="endMode"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="count">After N payments</option>
              <option value="date">On a fixed date</option>
              <option value="total">When a total is collected</option>
            </select>
          </label>
          <Field label="End: number of payments" name="endCount" type="number" help="For 'After N payments'" tip={TIPS.endCount} />
          <Field label="End: date" name="endDate" type="date" help="For 'On a fixed date'" tip={TIPS.endDate} />
          <Field label="End: total (£)" name="endTotal" type="number" help="For 'When a total is collected'" tip={TIPS.endTotal} />
        </Section>
        )}

        <Section title="VRP consent limits">
          <CeilingSuggester ownAmount={!canSchedule} />
          <Field label="Ceiling for any single payment (£)" name="maxPaymentAmount" type="number" required placeholder="600.00" tip={TIPS.maxPaymentAmount} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              The period is
              <InfoTip text={TIPS.consentPeriod} />
            </span>
            <select
              name="consentPeriod"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">None</option>
              <option value="DAY">Day</option>
              <option value="WEEK">Week</option>
              <option value="MONTH">Month</option>
              <option value="YEAR">Year</option>
            </select>
          </label>
          <Field label="Ceiling across the whole period (£)" name="periodicMaxAmount" type="number" required placeholder="2400.00" tip={TIPS.periodicMaxAmount} />
          <Field label="Valid from" name="consentValidFrom" type="datetime-local" tip={TIPS.consentValidFrom} />
          <Field label="Valid to" name="consentValidTo" type="datetime-local" tip={TIPS.consentValidTo} />
        </Section>

        <div className="flex justify-end gap-2">
          <Link
            href="/borrowers"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </Link>
          <SubmitButton
            pendingLabel="Creating…"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Create borrower
          </SubmitButton>
        </div>
      </BorrowerCreateForm>
    </div>
  );
}
