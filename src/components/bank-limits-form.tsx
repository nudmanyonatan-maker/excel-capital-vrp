"use client";

import { InfoTip } from "@/components/info-tip";
import { TIPS } from "@/lib/help-text";
import { useActionState } from "react";
import {
  updateBankAndLimitsAction,
  updatePayerAccountAction,
  type BankLimitsState,
  type PayerAccountState,
} from "@/lib/actions/bank-limits";
import type { PayoutChoice } from "@/lib/payout-accounts";
import { PayoutAccountSelect } from "@/components/payout-account-select";

const input =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm";

/**
 * Set the destination account and the payment limits. Shown on the borrower's
 * Edit page so an incomplete borrower can be completed, which previously was
 * impossible once created.
 */
export function BankLimitsForm({
  borrowerId,
  locked,
  choices,
  current,
  payerMasked,
  defaults,
}: {
  borrowerId: string;
  locked: boolean;
  /** The approved accounts this person may choose, already masked. */
  choices: PayoutChoice[];
  /**
   * The account the borrower is set up with now, when it was typed in before the
   * approved list existed. Shown so nobody wonders where the old one went.
   */
  current: string | null;
  /** The business account mandates are locked to, masked, or null if none yet. */
  payerMasked: string | null;
  defaults: {
    payerAccount: string;
    payerSort: string;
    payoutAccountId: string;
    maxPaymentAmount: string;
    periodicMaxAmount: string;
    consentPeriod: string;
  };
}) {
  const [state, formAction, pending] = useActionState<BankLimitsState, FormData>(
    updateBankAndLimitsAction,
    null,
  );
  // Prefer what was just typed over what is stored, so a validation error never
  // discards the operator's work.
  const shown = { ...defaults, ...(state?.values ?? {}) };

  if (locked) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <p className="font-medium text-slate-800">
            The limits and where repayments are sent are locked in with the borrower&apos;s bank.
          </p>
          <p className="mt-1">
            The borrower has already agreed these limits, so changing them here
            would no longer match what their bank approved. To use different
            limits, send a new setup link and ask them to approve again.
          </p>
        </div>
        {/* The business account is not part of what the bank approved, so it
            stays editable. Without this, borrowers onboarded before mandates
            were locked to one could never be given one. */}
        <PayerAccountForm borrowerId={borrowerId} payerMasked={payerMasked} />
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <input type="hidden" name="borrowerId" value={borrowerId} />

      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Where repayments are sent
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Chosen from the accounts an admin has approved. This is where the borrower&apos;s money
          lands.
        </p>
      </div>
      {current && (
        <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
          Currently set up with {current}, which was typed in before the approved list existed.
          Choosing an account below replaces it.
        </p>
      )}
      <PayoutAccountSelect choices={choices} defaultValue={shown.payoutAccountId || undefined} />

      <div className="border-t border-slate-100 pt-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Where repayments come from
          <InfoTip text={TIPS.payerAccount} />
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {payerMasked
            ? `Locked to the business account ${payerMasked}. Leave these blank to keep it.`
            : "Not locked yet, so the borrower could approve from any account. Add their business account."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Business account number</span>
          <input name="payerAccount" inputMode="numeric" placeholder="12345678" defaultValue={shown.payerAccount} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Business sort code</span>
          <input name="payerSort" inputMode="numeric" placeholder="12-34-56" defaultValue={shown.payerSort} className={input} />
        </label>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h2 className="text-sm font-semibold text-slate-900">Payment limits</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          The borrower approves these with their bank. You can never take more
          than this, which is what makes it safe for them to agree.
        </p>
        <p className="mt-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          These are CEILINGS, not the repayment amount. Set them ABOVE the normal
          repayment so you have room for a late fee or a missed payment later. If
          the repayment is £500 and the ceiling is also £500, a late fee can never
          be collected and their bank will refuse it.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Ceiling for any single payment
            <InfoTip text={TIPS.maxPaymentAmount} />
          </span>
          <input
            name="maxPaymentAmount"
            type="number"
            step="0.01"
            placeholder="500.00"
            defaultValue={shown.maxPaymentAmount}
            className={input}
          />
          <span className="mt-1 block text-xs text-slate-500">
            In pounds. Higher than the repayment, e.g. repayment plus 20%.
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Ceiling across the whole period
            <InfoTip text={TIPS.periodicMaxAmount} />
          </span>
          <input
            name="periodicMaxAmount"
            type="number"
            step="0.01"
            placeholder="2000.00"
            defaultValue={shown.periodicMaxAmount}
            className={input}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Must be at least the single payment limit.
          </span>
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          The period is
          <InfoTip text={TIPS.consentPeriod} />
        </span>
        <select
          name="consentPeriod"
          defaultValue={shown.consentPeriod || "MONTH"}
          className={input}
        >
          <option value="DAY">Per day</option>
          <option value="WEEK">Per week</option>
          <option value="MONTH">Per month</option>
          <option value="YEAR">Per year</option>
        </select>
      </label>

      {state?.errors && state.errors.length > 0 && (
        <ul
          role="alert"
          className="list-disc space-y-1 rounded-md border border-red-200 bg-red-50 p-3 pl-7 text-sm text-red-800"
        >
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {state?.saved && !state.needsNewLink && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          ✓ Saved. This borrower is ready for a setup link now.
        </p>
      )}
      {state?.saved && state.needsNewLink && (
        // A correction the borrower has to re-approve is NOT the same outcome as
        // a plain save, and saying so is the difference between an operator
        // knowing the mandate is stale and believing the fix has taken effect.
        <p
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          ✓ Saved. These details had already been sent to the bank, so the old mandate no longer
          applies. Send the borrower a new setup link and ask them to approve it again, otherwise
          nothing can be collected.
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save bank details and limits"}
        </button>
      </div>
    </form>
  );
}

/**
 * Set the business account for a borrower whose mandate is already approved.
 * Their current mandate keeps working as approved; every new one is locked to
 * this account.
 */
function PayerAccountForm({
  borrowerId,
  payerMasked,
}: {
  borrowerId: string;
  payerMasked: string | null;
}) {
  const [state, formAction, pending] = useActionState<PayerAccountState, FormData>(
    updatePayerAccountAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <input type="hidden" name="borrowerId" value={borrowerId} />
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Where repayments come from
          <InfoTip text={TIPS.payerAccount} />
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {payerMasked
            ? `Locked to the business account ${payerMasked}. Enter a different one to change it.`
            : "No business account on file yet. Add it so any new mandate can only be approved from it."}{" "}
          Their current mandate keeps working exactly as their bank approved it.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Business account number</span>
          <input
            name="payerAccount"
            inputMode="numeric"
            required
            placeholder="12345678"
            defaultValue={state?.values?.payerAccount ?? ""}
            className={input}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Business sort code</span>
          <input
            name="payerSort"
            inputMode="numeric"
            required
            placeholder="12-34-56"
            defaultValue={state?.values?.payerSort ?? ""}
            className={input}
          />
        </label>
      </div>
      {state?.errors && state.errors.length > 0 && (
        <ul
          role="alert"
          className="list-disc space-y-1 rounded-md border border-red-200 bg-red-50 p-3 pl-7 text-sm text-red-800"
        >
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {state?.saved && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          ✓ Saved. Their current mandate is unchanged. Any new mandate, for example after
          Cancel mandate, can only be approved from this account.
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save business account"}
        </button>
      </div>
    </form>
  );
}
