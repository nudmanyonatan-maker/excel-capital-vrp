import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { MockPlaidClient } from "@/lib/plaid/mock";
import { cancelMandate } from "@/lib/engine/cancel-mandate";
import { createBorrower, getBorrower } from "@/lib/repo/borrowers";
import { addRecipient, listDestinations } from "@/lib/repo/destinations";
import { attachPlaidConsent, createPendingConsent, getConsent, setConsentStatus } from "@/lib/repo/consents";
import { getActiveSchedule, upsertSchedule } from "@/lib/repo/schedules";
import { encryptString, sha256Hex } from "@/lib/crypto";

const KEY = "test-encryption-key";
let n = 0;

/** An approved borrower with a schedule, as AKA Taxi Rentals was. */
async function approvedBorrower() {
  const b = await createBorrower(env.DB, { legalName: `Cancel ${n++} Ltd`, createdBy: null });
  const recipient = await addRecipient(env.DB, b.id, { name: "Excel Capital" });
  const consent = await createPendingConsent(env.DB, b.id, {
    recipientId: recipient.id,
    maxPaymentAmountMinor: 1_000_000,
    periodicMaxAmountMinor: 20_000_000,
    period: "MONTH",
  });
  const plaidId = `live-${crypto.randomUUID()}`;
  await attachPlaidConsent(env.DB, consent.id, {
    plaidConsentIdEncrypted: await encryptString(plaidId, KEY),
    plaidConsentIdHash: await sha256Hex(plaidId),
    plaidRecipientId: "r",
  });
  await setConsentStatus(env.DB, consent.id, "authorized");
  await env.DB.prepare("UPDATE borrowers SET status = 'active' WHERE id = ?").bind(b.id).run();
  await upsertSchedule(env.DB, b.id, {
    amountMinor: 50_000,
    frequency: "weekly",
    startDate: "2026-11-02",
    endMode: "count",
    endCount: 10,
    consentId: consent.id,
  });
  return { borrowerId: b.id, consentId: consent.id, plaidId };
}

describe("staff cancelling an approved mandate", () => {
  it("cancels it at the bank, then here, and leaves a replacement ready to approve", async () => {
    const plaid = new MockPlaidClient();
    const { borrowerId, consentId, plaidId } = await approvedBorrower();

    const result = await cancelMandate(env.DB, plaid, KEY, { borrowerId, consentId, actorStaffId: null });

    expect(result.ok).toBe(true);
    expect((await plaid.getConsent(plaidId)).status).toBe("REVOKED");
    expect((await getConsent(env.DB, consentId))?.status).toBe("revoked");
    const replacement = result.ok ? result.replacement : null;
    expect(replacement?.status).toBe("pending");
    expect(replacement?.periodic_max_amount_minor).toBe(20_000_000);
    // Every screen shows the replacement for that account, not the cancelled one.
    expect((await listDestinations(env.DB, borrowerId))[0].consent?.id).toBe(replacement?.id);
    // The schedule follows it, so collections resume once the borrower approves.
    expect((await getActiveSchedule(env.DB, borrowerId))?.consent_id).toBe(replacement?.id);
    expect((await getBorrower(env.DB, borrowerId))?.status).toBe("revoked");
  });

  it("changes nothing here when the bank does not confirm", async () => {
    class Down extends MockPlaidClient {
      override async revokeConsent(): Promise<void> {
        throw new Error("plaid unavailable");
      }
    }
    const { borrowerId, consentId } = await approvedBorrower();

    const result = await cancelMandate(env.DB, new Down(), KEY, { borrowerId, consentId, actorStaffId: null });

    expect(result.ok).toBe(false);
    expect((await getConsent(env.DB, consentId))?.status).toBe("authorized");
    expect((await getActiveSchedule(env.DB, borrowerId))?.consent_id).toBe(consentId);
  });

  it("refuses a mandate belonging to another borrower", async () => {
    const mine = await approvedBorrower();
    const theirs = await approvedBorrower();

    const result = await cancelMandate(env.DB, new MockPlaidClient(), KEY, {
      borrowerId: mine.borrowerId,
      consentId: theirs.consentId,
      actorStaffId: null,
    });

    expect(result.ok).toBe(false);
    expect((await getConsent(env.DB, theirs.consentId))?.status).toBe("authorized");
  });

  it("refuses to cancel twice", async () => {
    const plaid = new MockPlaidClient();
    const { borrowerId, consentId } = await approvedBorrower();
    await cancelMandate(env.DB, plaid, KEY, { borrowerId, consentId, actorStaffId: null });

    const again = await cancelMandate(env.DB, plaid, KEY, { borrowerId, consentId, actorStaffId: null });

    expect(again.ok).toBe(false);
  });
});
