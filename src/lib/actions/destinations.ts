"use server";

import { revalidatePath } from "next/cache";
import { getDb, getEnv } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/repo/audit";
import { unprotectString } from "@/lib/crypto";
import {
  addRecipient,
  archiveRecipient,
  listDestinations,
  setDefaultRecipient,
} from "@/lib/repo/destinations";
import { createPendingConsent } from "@/lib/repo/consents";
import { getActiveSchedule } from "@/lib/repo/schedules";
import { parseLimits } from "@/lib/borrower-setup-input";
import { choosePayoutAccount, recipientFieldsFrom } from "@/lib/payout-accounts";
import { getPlaidClient } from "@/lib/plaid";
import { cancelMandate } from "@/lib/engine/cancel-mandate";

export interface DestinationValues {
  label: string;
  payoutAccountId: string;
  maxPaymentAmount: string;
  periodicMaxAmount: string;
  consentPeriod: string;
}

export type DestinationState =
  | { errors?: string[]; saved?: string; values?: DestinationValues }
  | null;

/**
 * Add a second (or third) payout account for a borrower, with its own mandate.
 *
 * Each account gets its OWN consent because Plaid binds a mandate permanently to
 * one recipient: that is what makes choosing a destination safe rather than a
 * reroute. It also means the borrower must approve each account separately, so a
 * new account starts pending and a fresh setup link is needed.
 */
export async function addDestinationAction(
  _prev: DestinationState,
  fd: FormData,
): Promise<DestinationState> {
  const user = await requireRole("operator");
  const db = getDb();
  const env = getEnv();

  const borrowerId = String(fd.get("borrowerId") ?? "");
  if (!borrowerId) return { errors: ["Something went wrong: no borrower was selected."] };

  const values: DestinationValues = {
    label: String(fd.get("label") ?? ""),
    payoutAccountId: String(fd.get("payoutAccountId") ?? ""),
    maxPaymentAmount: String(fd.get("maxPaymentAmount") ?? ""),
    periodicMaxAmount: String(fd.get("periodicMaxAmount") ?? ""),
    consentPeriod: String(fd.get("consentPeriod") ?? ""),
  };

  const parsed = parseLimits({
    ...values,
    consentValidTo: String(fd.get("consentValidTo") ?? ""),
  });
  // Chosen from the approved list, never typed: see choosePayoutAccount.
  const payout = await choosePayoutAccount(db, user, values.payoutAccountId);
  const errors = [...(payout.ok ? [] : [payout.reason]), ...parsed.errors];
  if (errors.length > 0 || !parsed.value || !payout.ok) return { errors, values };
  const v = parsed.value;

  // Refuse an exact duplicate account. Two mandates to the SAME account would
  // double this borrower's effective ceiling while appearing to be a routing
  // choice that changes nothing, which is the one shape of this feature that is
  // all risk and no benefit.
  const existing = await listDestinations(db, borrowerId);
  const [wantAccount, wantSort] = await Promise.all([
    unprotectString(payout.account.account_number, env.APP_ENCRYPTION_KEY),
    unprotectString(payout.account.sort_code, env.APP_ENCRYPTION_KEY),
  ]);
  // Compare plaintext rather than ciphertext: rows typed in before the approved
  // list existed hold their own encryption of the same digits.
  for (const d of existing) {
    if (!d.recipient || d.recipient.archived_at) continue;
    const [acct, sort] = await Promise.all([
      unprotectString(d.recipient.account_number, env.APP_ENCRYPTION_KEY),
      unprotectString(d.recipient.sort_code, env.APP_ENCRYPTION_KEY),
    ]);
    if (
      acct?.replace(/\D/g, "") === wantAccount?.replace(/\D/g, "") &&
      sort?.replace(/\D/g, "") === wantSort?.replace(/\D/g, "")
    ) {
      return {
        errors: [
          "That account is already set up for this borrower. Adding it twice would double how much can be taken, without changing where the money goes.",
        ],
        values,
      };
    }
  }

  const recipient = await addRecipient(db, borrowerId, {
    ...recipientFieldsFrom(payout.account),
    label: values.label.trim() || payout.account.label,
    // Never silently steal the default: scheduled collections follow it, and a
    // new unapproved account cannot receive anything yet.
    makeDefault: false,
  });

  await createPendingConsent(db, borrowerId, {
    recipientId: recipient.id,
    currency: "GBP",
    maxPaymentAmountMinor: v.maxPaymentAmountMinor,
    periodicMaxAmountMinor: v.periodicMaxAmountMinor,
    period: v.period,
    validTo: v.validTo,
  });

  await writeAudit(db, {
    actorStaffId: user.id,
    action: "destination.add",
    entityType: "borrower",
    entityId: borrowerId,
    metadata: { recipientId: recipient.id, label: recipient.label },
  });

  revalidatePath(`/borrowers/${borrowerId}`);
  return {
    saved:
      "Account added. Send the borrower a setup link so they can approve it, then you can choose it when collecting.",
  };
}

/** Move the default account, which is where scheduled collections go. */
export async function setDefaultDestinationAction(
  _prev: DestinationState,
  fd: FormData,
): Promise<DestinationState> {
  const user = await requireRole("operator");
  const db = getDb();
  const borrowerId = String(fd.get("borrowerId") ?? "");
  const recipientId = String(fd.get("recipientId") ?? "");
  if (!borrowerId || !recipientId) {
    return { errors: ["Something went wrong: no account was selected."] };
  }

  const ok = await setDefaultRecipient(db, borrowerId, recipientId);
  if (!ok) return { errors: ["That account is not set up for this borrower."] };

  await writeAudit(db, {
    actorStaffId: user.id,
    action: "destination.set_default",
    entityType: "borrower",
    entityId: borrowerId,
    metadata: { recipientId },
  });
  revalidatePath(`/borrowers/${borrowerId}`);

  // Only true when the schedule actually follows the default. A schedule pinned
  // to a specific mandate ignores this entirely, and telling an operator their
  // collections have moved when they have not is how money ends up somewhere
  // nobody is watching.
  const schedule = await getActiveSchedule(db, borrowerId);
  if (schedule?.consent_id) {
    return {
      saved:
        "Default account changed. The repayment schedule pays into a specific account, so " +
        "scheduled collections are unaffected: change the schedule if you want them to move too.",
    };
  }
  return { saved: "Default account changed. Scheduled collections will now go here." };
}

/** Retire an account from the picker, keeping its payment history readable. */
export async function archiveDestinationAction(
  _prev: DestinationState,
  fd: FormData,
): Promise<DestinationState> {
  const user = await requireRole("operator");
  const db = getDb();
  const borrowerId = String(fd.get("borrowerId") ?? "");
  const recipientId = String(fd.get("recipientId") ?? "");
  if (!borrowerId || !recipientId) {
    return { errors: ["Something went wrong: no account was selected."] };
  }

  const result = await archiveRecipient(db, borrowerId, recipientId);
  if (!result.ok) return { errors: [result.reason] };

  await writeAudit(db, {
    actorStaffId: user.id,
    action: "destination.archive",
    entityType: "borrower",
    entityId: borrowerId,
    metadata: { recipientId },
  });
  revalidatePath(`/borrowers/${borrowerId}`);
  return { saved: "Account retired. Its past payments are still shown in the history." };
}

/**
 * Cancel an approved mandate so the borrower can approve new terms. Operators
 * and admins only: it stops collections into that account until the borrower
 * approves again, so it is a collections decision, not an onboarding one.
 */
export async function cancelMandateAction(
  _prev: DestinationState,
  fd: FormData,
): Promise<DestinationState> {
  const user = await requireRole("operator");
  const db = getDb();
  const env = getEnv();
  const borrowerId = String(fd.get("borrowerId") ?? "");
  const consentId = String(fd.get("consentId") ?? "");
  if (!borrowerId || !consentId) return { errors: ["Something went wrong: no mandate was selected."] };

  const result = await cancelMandate(db, getPlaidClient(env), env.APP_ENCRYPTION_KEY, {
    borrowerId,
    consentId,
    actorStaffId: user.id,
  });
  if (!result.ok) return { errors: [result.reason] };

  revalidatePath(`/borrowers/${borrowerId}`);
  return {
    saved:
      "Mandate cancelled with the bank. Nothing more can be collected into this account until the borrower approves again. Change the limits under Edit if you need to, then press Generate setup link and send it to them.",
  };
}
