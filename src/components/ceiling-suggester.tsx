"use client";

import { useState } from "react";

/**
 * Offers sensible consent ceilings based on the repayment already typed above.
 *
 * The client set the single-payment ceiling equal to the repayment, which makes a
 * late fee impossible: the borrower's bank refuses anything above what they
 * agreed. A warning after the fact did not prevent it, so this proposes the
 * numbers instead, and shows the arithmetic so they are not magic.
 *
 * Reads and writes the sibling inputs rather than owning them, so the
 * surrounding form stays a plain server-action form.
 */
export function CeilingSuggester({
  ownAmount = false,
}: {
  /**
   * Ask for the repayment here instead of reading the schedule above. A sales
   * rep has no schedule section, so without this the button could only ever
   * tell them to fill in a field they cannot see.
   */
  ownAmount?: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [localAmount, setLocalAmount] = useState("");
  const [localFrequency, setLocalFrequency] = useState("weekly");

  const input = (name: string) =>
    document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
  const select = (name: string) =>
    document.querySelector(`[name="${name}"]`) as HTMLSelectElement | null;

  function suggest() {
    const amount = Number(ownAmount ? localAmount : (input("amount")?.value ?? ""));
    const frequency = ownAmount ? localFrequency : (select("frequency")?.value ?? "weekly");
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage(
        ownAmount
          ? "Enter the expected repayment first, then press this again."
          : "Enter the repayment amount above first, then press this again.",
      );
      return;
    }

    // 20% headroom, rounded up to the nearest £10.
    const single = Math.ceil((amount * 1.2) / 10) * 10;
    const perMonth: Record<string, number> = {
      daily: 30,
      weekly: 5,
      fortnightly: 3,
      monthly: 2,
      custom: 5,
    };
    const times = perMonth[frequency] ?? 5;
    const periodic = single * times;

    const singleField = input("maxPaymentAmount");
    const periodicField = input("periodicMaxAmount");
    const periodField = select("consentPeriod");
    if (singleField) singleField.value = single.toFixed(2);
    if (periodicField) periodicField.value = periodic.toFixed(2);
    if (periodField && !periodField.value) periodField.value = "MONTH";

    setMessage(
      `Suggested £${single.toFixed(2)} ceiling per payment, which is the £${amount.toFixed(2)} repayment amount plus 20% to account for potential late fees. ` +
      `Allowing ${times} ${frequency} collections in a month, the period ceiling should be £${periodic.toFixed(2)} per month.`,
    );
  }

  return (
    <div className="col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      {ownAmount && (
        // Deliberately unnamed: these only feed the suggestion and are never
        // submitted, so nothing here can set a schedule.
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Expected repayment (£)</span>
            <input
              type="number"
              step="0.01"
              value={localAmount}
              onChange={(e) => setLocalAmount(e.target.value)}
              placeholder="500.00"
              className="mt-1 block w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">How often</span>
            <select
              value={localFrequency}
              onChange={(e) => setLocalFrequency(e.target.value)}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
      )}
      <button
        type="button"
        onClick={suggest}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
      >
        {ownAmount ? "Suggest ceilings" : "Suggest ceilings from the repayment amount"}
      </button>
      <p className="mt-1 text-xs text-slate-500">
        Not sure what to put? This fills both ceilings with sensible values that
        leave room for a late fee.
      </p>
      {message && (
        <p role="status" className="mt-2 text-xs text-slate-700">
          {message}
        </p>
      )}
    </div>
  );
}
