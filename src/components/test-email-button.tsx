"use client";

import { useActionState } from "react";
import { sendTestEmailAction, type TestEmailState } from "@/lib/actions/settings";

/** Sends one email to the admin pressing it, to prove email really reaches an inbox. */
export function TestEmailButton() {
  const [state, formAction, pending] = useActionState<TestEmailState, FormData>(sendTestEmailAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send me a test email"}
      </button>
      {state && (
        <span role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
