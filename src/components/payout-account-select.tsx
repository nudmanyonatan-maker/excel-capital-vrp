import type { PayoutChoice } from "@/lib/payout-accounts";
import { InfoTip } from "@/components/info-tip";

/**
 * Choose where a borrower's repayments are paid into, from the approved list.
 *
 * This replaces the free-text account number and sort code fields. Nobody but
 * an admin can add to the list, so whoever onboards a borrower cannot point
 * their repayments at an account of their own.
 */
export function PayoutAccountSelect({
  choices,
  defaultValue,
  className,
  labelClassName = "text-sm font-medium text-slate-700",
  label = "Repayments are paid into",
  tip,
}: {
  choices: PayoutChoice[];
  defaultValue?: string;
  className?: string;
  labelClassName?: string;
  label?: string;
  tip?: string;
}) {
  if (choices.length === 0) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        There are no approved accounts to pay repayments into yet. Ask an admin to add one under
        Settings, then come back.
      </p>
    );
  }
  return (
    <label className="block">
      <span className={labelClassName}>
        {label}
        <span className="text-red-500"> *</span>
        {tip && <InfoTip text={tip} />}
      </span>
      <select
        name="payoutAccountId"
        required
        defaultValue={defaultValue ?? (choices.length === 1 ? choices[0].id : "")}
        className={className ?? "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"}
      >
        {choices.length > 1 && (
          <option value="" disabled>
            Choose an account
          </option>
        )}
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label} ({c.masked})
          </option>
        ))}
      </select>
    </label>
  );
}
