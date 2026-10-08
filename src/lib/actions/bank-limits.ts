"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/repo/audit";
import { addRecipient, listDestinations, updateRecipient } from "@/lib/repo/destinations";
import {
  createPendingConsent,
  updateUnauthorisedConsentLimits,
  setConsentRecipient,
} from "@/lib/repo/consents";
import { parseLimits } from "@/lib/borrower-setup-input";
import { choosePayoutAccount, recipientFieldsFrom } from "@/lib/payout-accounts";

/**
 * `values` echoes back what was submitted so a validation error does not wipe
 * the operator's typing. Without it, fixing one field silently clears the rest.
 */
export interface BankLimitsValues {
  payoutAccountId: string;
  maxPaymentAmount: string;
  periodicMaxAmount: string;
  consentPeriod: string;
}
export type BankLimitsState =
  | {
      errors?: string[];
      saved?: boolean;
      /** The change detached the mandate from the bank; the borrower must re-approve. */
      needsNewLink?: boolean;
      values?: BankLimitsValues;
    }
  | null;

/**
 * Set or correct the destination bank account and the VRP limits for a borrower
 * that has not authorised yet.
 *
 * This exists because a borrower could previously be created with neither, and
 * there was then no way to fill them in: the only failure surfaced was the
 * borrower seeing "Setup is temporarily unavailable".
 */
export async function updateBankAndLimitsAction(
  _prev: BankLimitsState,
  fd: FormData,
): Promise<BankLimitsState> {
  const user = await requireRole("operator");
  const db = getDb();

  const borrowerId = String(fd.get("borrowerId") ?? "");
  if (!borrowerId) return { errors: ["Something went wrong: no borrower was selected."] };

  const values: BankLimitsValues = {
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
  const fields = recipientFieldsFrom(payout.account);

  // Both halves of this form must describe the SAME account.
  //
  // They did not. upsertRecipient edited the NEWEST recipient row while
  // getActiveConsent returned the DEFAULT account's mandate, and once a borrower
  // has two accounts those are different rows. The form showed the backup
  // account's sort code beside the main account's limits, and saving overwrote
  // the backup's bank details. Anchor everything to the default destination.
  const destinations = (await listDestinations(db, borrowerId)).filter(
    (d) => d.recipient && d.recipient.archived_at == null,
  );
  const target =
    destinations.find((d) => d.recipient!.is_default) ?? destinations[0] ?? null;
  const consent = target?.consent ?? null;

  if (consent?.status === "authorized") {
    return {
      errors: [
        "This borrower has already authorised these limits with their bank, so they cannot be changed here. Send a new setup link to agree new limits.",
      ],
      values,
    };
  }

  // Update the account this form is actually about, by id, rather than whichever
  // row happens to be newest. Re-saving the account it already uses changes
  // nothing, so the borrower is not asked to approve again for no reason.
  let recipient = target?.recipient ?? null;
  let needsNewLink = false;
  if (recipient) {
    if (recipient.payout_account_id !== payout.account.id) {
      const { detachedFromPlaid } = await updateRecipient(db, recipient.id, {
        ...fields,
        label: recipient.label,
      });
      needsNewLink ||= detachedFromPlaid;
    }
  } else {
    recipient = await addRecipient(db, borrowerId, fields);
  }

  if (consent) {
    const { needsReapproval } = await updateUnauthorisedConsentLimits(db, consent.id, {
      maxPaymentAmountMinor: v.maxPaymentAmountMinor,
      periodicMaxAmountMinor: v.periodicMaxAmountMinor,
      period: v.period,
      validTo: v.validTo,
    });
    needsNewLink ||= needsReapproval;
    // Bind the mandate to this account. Without it the mandate is an orphan: still
    // collectable, but the payment history could not say where money went.
    if (!consent.recipient_id) await setConsentRecipient(db, consent.id, recipient.id);
  } else {
    await createPendingConsent(db, borrowerId, {
      recipientId: recipient.id,
      currency: "GBP",
      maxPaymentAmountMinor: v.maxPaymentAmountMinor,
      periodicMaxAmountMinor: v.periodicMaxAmountMinor,
      period: v.period,
      validTo: v.validTo,
    });
  }

  await writeAudit(db, {
    actorStaffId: user.id,
    action: "borrower.bank_and_limits.update",
    entityType: "borrower",
    entityId: borrowerId,
  });
  revalidatePath(`/borrowers/${borrowerId}`);
  // Said plainly, because the alternative is an operator believing a correction
  // took effect at the bank when the borrower still has to approve it.
  return { saved: true, needsNewLink };
}
