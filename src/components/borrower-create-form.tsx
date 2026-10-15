"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createBorrowerFormAction,
  type CreateBorrowerState,
} from "@/lib/actions/borrowers";

/**
 * Put typed values back into a form's named fields.
 *
 * React clears a form once its action finishes, even when the action refused
 * it, so a single bad field used to cost the operator everything else they had
 * typed: limits, schedule, bank details.
 */
function restoreFields(form: HTMLFormElement, data: FormData) {
  for (const el of Array.from(form.elements)) {
    if (
      !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) ||
      !el.name
    ) {
      continue;
    }
    const values = data.getAll(el.name).map(String);
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      el.checked = values.includes(el.value);
    } else if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file")) {
      continue;
    } else if (values.length > 0) {
      el.value = values[0];
    }
  }
}

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
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);

  // Runs after React's reset, so what was typed is what stays on screen. The
  // message sits at the top of a long form, so bring it into view as well: with
  // the fields no longer cleared, nothing else shows the press was refused.
  useEffect(() => {
    if (state?.message && formRef.current && submitted.current) {
      restoreFields(formRef.current, submitted.current);
      formRef.current.querySelector('[role="alert"]')?.scrollIntoView({ block: "center" });
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        submitted.current = new FormData(e.currentTarget);
      }}
      className={className}
    >
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
