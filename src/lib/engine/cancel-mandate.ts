import type { PlaidClient } from "@/lib/plaid";
import { getConsent } from "@/lib/repo/consents";
import { syncBorrowerStatusToMandates } from "@/lib/repo/borrowers";
import { writeAudit } from "@/lib/repo/audit";
import { decryptString } from "@/lib/crypto";
import { replaceConsent } from "@/lib/engine/setup";
import type { Consent } from "@/lib/types";

export type CancelResult =
  | { ok: true; replacement: Consent }
  | { ok: false; reason: string };

/**
 * Cancel an approved mandate so the borrower can approve a new one.
 *
 * Staff needed this to change terms after approval (a borrower wanting a yearly
 * limit instead of a monthly one), and the only route was asking the borrower to
 * cancel it in their own banking app. Approved limits are fixed at the bank and
 * can never be edited, so changing them always means cancel and approve again.
 *
 * The bank is told first. Only once Plaid confirms is it marked cancelled here,
 * so this can never say a mandate is gone while it is still live. A pending
 * replacement carrying the same limits is created straight away, with the
 * schedule moved onto it: staff edit its limits if they want, send a setup link,
 * and collections resume once the borrower approves.
 */
export async function cancelMandate(
  db: D1Database,
  plaid: PlaidClient,
  encryptionKey: string,
  opts: { borrowerId: string; consentId: string; actorStaffId: string | null },
): Promise<CancelResult> {
  const consent = await getConsent(db, opts.consentId);
  if (!consent || consent.borrower_id !== opts.borrowerId) {
    return { ok: false, reason: "That mandate is not set up for this borrower." };
  }
  if (consent.status !== "authorized" || !consent.plaid_consent_id) {
    return { ok: false, reason: "Only an approved mandate can be cancelled. Refresh the page." };
  }

  try {
    await plaid.revokeConsent(await decryptString(consent.plaid_consent_id, encryptionKey));
  } catch (error) {
    console.error("could not cancel mandate with the bank", consent.id, error);
    return {
      ok: false,
      reason:
        "The bank did not confirm the cancellation, so nothing was changed and the mandate is still live. Try again in a few minutes.",
    };
  }

  const updated = await db
    .prepare("UPDATE consents SET status = 'revoked' WHERE id = ? AND status = 'authorized'")
    .bind(consent.id)
    .run();
  if ((updated.meta.changes ?? 0) === 0) {
    return { ok: false, reason: "That mandate was already cancelled. Refresh the page." };
  }

  const replacement = await replaceConsent(db, opts.borrowerId, consent, consent.recipient_id);
  await syncBorrowerStatusToMandates(db, opts.borrowerId, "revoked");
  await writeAudit(db, {
    actorStaffId: opts.actorStaffId,
    action: "consent.cancelled_by_staff",
    entityType: "borrower",
    entityId: opts.borrowerId,
    metadata: { consentId: consent.id, replacementId: replacement.id, recipientId: consent.recipient_id },
  });
  return { ok: true, replacement };
}
