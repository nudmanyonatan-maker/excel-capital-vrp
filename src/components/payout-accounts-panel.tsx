"use client";

import { useActionState, useState } from "react";
import {
  addPayoutAccountAction,
  adoptExistingAccountAction,
  archivePayoutAccountAction,
  setSalesCanUseAction,
  type PayoutAccountState,
} from "@/lib/actions/payout-accounts";

export interface PayoutAccountRow {
  id: string;
  label: string;
  name: string;
  masked: string;
  archived: boolean;
  salesCanUse: boolean;
}

export interface UnlinkedRow {
  key: string;
  name: string;
  masked: string;
  borrowers: string[];
}

const field = "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm";
const labelCls = "text-xs font-medium text-slate-700";

function Message({ state }: { state: PayoutAccountState }) {
  if (state?.error) {
    return (
      <p role="alert" className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">
        {state.error}
      </p>
    );
  }
  if (state?.saved) {
    return (
      <p role="status" className="mt-2 rounded-md bg-emerald-50 p-2 text-sm text-emerald-900">
        {state.saved}
      </p>
    );
  }
  return null;
}

function ArchiveButton({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<PayoutAccountState, FormData>(
    archivePayoutAccountAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action} className="text-right">
      <input type="hidden" name="payoutAccountId" value={id} />
      {confirming ? (
        <span className="inline-flex items-center gap-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-red-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {pending ? "…" : `Remove ${label}`}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Remove from list
        </button>
      )}
      <Message state={state} />
    </form>
  );
}

function SalesToggle({ id, allowed }: { id: string; allowed: boolean }) {
  const [state, action, pending] = useActionState<PayoutAccountState, FormData>(
    setSalesCanUseAction,
    null,
  );
  return (
    <form action={action}>
      <input type="hidden" name="payoutAccountId" value={id} />
      <input type="hidden" name="allowed" value={allowed ? "false" : "true"} />
      <span className={`mr-2 text-xs ${allowed ? "text-emerald-700" : "text-slate-500"}`}>
        {allowed ? "Sales reps can use" : "Not for sales reps"}
      </span>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "…" : allowed ? "Close to sales" : "Open to sales"}
      </button>
      <Message state={state} />
    </form>
  );
}

function AddForm() {
  const [state, action, pending] = useActionState<PayoutAccountState, FormData>(
    addPayoutAccountAction,
    null,
  );
  return (
    <form action={action} className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Add an account</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>What staff will see</span>
          <input name="label" required placeholder="Excel Capital" className={field} />
        </label>
        <label className="block">
          <span className={labelCls}>Name on the account</span>
          <input name="recipientName" required maxLength={18} placeholder="Excel Capital" className={field} />
          <span className="mt-1 block text-xs text-slate-500">18 characters at most.</span>
        </label>
        <label className="block">
          <span className={labelCls}>Account number</span>
          <input name="accountNumber" required inputMode="numeric" placeholder="12345678" className={field} />
        </label>
        <label className="block">
          <span className={labelCls}>Sort code</span>
          <input name="sortCode" required inputMode="numeric" placeholder="12-34-56" className={field} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add account"}
      </button>
      <Message state={state} />
    </form>
  );
}

function AdoptRow({ row }: { row: UnlinkedRow }) {
  const [state, action, pending] = useActionState<PayoutAccountState, FormData>(
    adoptExistingAccountAction,
    null,
  );
  return (
    <li className="py-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="groupKey" value={row.key} />
        <div className="min-w-48 flex-1">
          <div className="text-sm font-medium text-slate-900">{row.name}</div>
          <div className="text-xs text-slate-500">{row.masked}</div>
          <div className="text-xs text-slate-500">
            Used by {row.borrowers.length} borrower{row.borrowers.length === 1 ? "" : "s"}:{" "}
            {row.borrowers.slice(0, 3).join(", ")}
            {row.borrowers.length > 3 ? ` and ${row.borrowers.length - 3} more` : ""}
          </div>
        </div>
        <label className="block">
          <span className={labelCls}>What staff will see</span>
          <input name="label" required defaultValue={row.name} className={field} />
        </label>
        <label className="block">
          <span className={labelCls}>Name on the account</span>
          <input name="recipientName" required maxLength={18} defaultValue={row.name} className={field} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to the list"}
        </button>
      </form>
      <Message state={state} />
    </li>
  );
}

/**
 * The accounts borrower repayments may be paid into. Only admins see this.
 * Everyone else can only choose from it, never type an account number.
 */
export function PayoutAccountsPanel({
  accounts,
  unlinked,
}: {
  accounts: PayoutAccountRow[];
  unlinked: UnlinkedRow[];
}) {
  const active = accounts.filter((a) => !a.archived);
  const removed = accounts.filter((a) => a.archived);
  return (
    <div className="space-y-4">
      {active.length === 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          No accounts yet, so nobody can onboard a borrower. Add the account repayments should go
          to below{unlinked.length > 0 ? ", or add one your borrowers already use" : ""}.
        </p>
      )}
      {active.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {active.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div>
                <div className="text-sm font-medium text-slate-900">{a.label}</div>
                <div className="text-xs text-slate-500">
                  {a.name} · {a.masked}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <SalesToggle id={a.id} allowed={a.salesCanUse} />
                <ArchiveButton id={a.id} label={a.label} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {unlinked.length > 0 && (
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Accounts your borrowers already pay into</h3>
          <p className="mt-1 text-xs text-slate-500">
            These were typed in before this list existed. Add the ones that are yours so staff can
            choose them. Anything you do not recognise, leave off and look into.
          </p>
          <ul className="divide-y divide-slate-100">
            {unlinked.map((row) => (
              <AdoptRow key={row.key} row={row} />
            ))}
          </ul>
        </div>
      )}

      <AddForm />

      {removed.length > 0 && (
        <p className="text-xs text-slate-500">
          Removed: {removed.map((a) => `${a.label} (${a.masked})`).join(", ")}
        </p>
      )}
    </div>
  );
}
