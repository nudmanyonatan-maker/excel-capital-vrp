"use client";

import { useActionState } from "react";
import {
  createBorrowerFormAction,
  type CreateBorrowerState,
} from "@/lib/actions/borrowers";

/**
 * The new-borrower form, wrapped so the action's refusals are shown in place.
 *
 * The fields stay in the page as server-rendered children; this only owns the
 * form element and the message, which is the whole reason it is a client
 * component. Without it a thrown validation error became a blank server error
 * page and the operator never learned what was wrong with their input.
 */
export function BorrowerCreateForm({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<CreateBorrowerState, FormData>(
    createBorrowerFormAction,
    null,
  );

  return (
    <form action={formAction} className={className}>
      {state?.message && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.message}
        </p>
      )}
      {children}
    </form>
  );
}
