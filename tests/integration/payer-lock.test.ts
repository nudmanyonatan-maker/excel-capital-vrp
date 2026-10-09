import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { MockPlaidClient } from "@/lib/plaid/mock";
import type { ConsentConstraints, CreateConsentResult, PayerAccount } from "@/lib/plaid";
import { provisionLinkToken } from "@/lib/engine/setup";
import { createBorrower, setBorrowerPayerAccount } from "@/lib/repo/borrowers";
import { addRecipient } from "@/lib/repo/destinations";
import { createPendingConsent, getConsent, setConsentStatus } from "@/lib/repo/consents";
import { protectString } from "@/lib/crypto";

const KEY = "test-encryption-key";
const ENV = { PLAID_WEBHOOK_URL: undefined, APP_BASE_URL: undefined };

class RecordingPlaid extends MockPlaidClient {
  payers: (PayerAccount | null | undefined)[] = [];
  override async createConsent(
    recipientId: string,
    reference: string,
    constraints: ConsentConstraints,
    payer?: PayerAccount | null,
  ): Promise<CreateConsentResult> {
    this.payers.push(payer);
    return { consentId: `payer-${crypto.randomUUID()}`, rawConstraints: constraints };
  }
}

let n = 0;
async function borrower(withPayer: boolean) {
  const b = await createBorrower(env.DB, { legalName: `PAYER ${n++} LIMITED`, createdBy: null });
  const recipient = await addRecipient(env.DB, b.id, {
    name: "Excel Capital",
    accountNumber: await protectString("11112222", KEY),
    sortCode: await protectString("334455", KEY),
  });
  const consent = await createPendingConsent(env.DB, b.id, {
    recipientId: recipient.id,
    maxPaymentAmountMinor: 10_000,
    periodicMaxAmountMinor: 100_000,
    period: "YEAR",
  });
  if (withPayer) {
    await setBorrowerPayerAccount(env.DB, b.id, {
      accountNumber: (await protectString("87654321", KEY))!,
      sortCode: (await protectString("040004", KEY))!,
    });
  }
  return { borrowerId: b.id, legalName: b.legal_name, consentId: consent.id };
}

/**
 * Borrowers were approving from accounts that are not the business's. Each
 * mandate is now locked to the business's own account, so their bank refuses
 * any other.
 */
describe("locking a mandate to the business's own account", () => {
  it("sends the business account with the mandate", async () => {
    const plaid = new RecordingPlaid();
    const { borrowerId, legalName } = await borrower(true);

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.payers[0]).toEqual({ name: legalName, accountNumber: "87654321", sortCode: "040004" });
  });

  it("leaves a borrower without one exactly as before", async () => {
    const plaid = new RecordingPlaid();
    const { borrowerId } = await borrower(false);

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.payers[0]).toBeNull();
  });

  it("re-issues a mandate already sent without the lock, so the next link is locked", async () => {
    const plaid = new RecordingPlaid();
    const { borrowerId, consentId } = await borrower(false);
    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);
    expect((await getConsent(env.DB, consentId))?.plaid_consent_id).toBeTruthy();

    const { detachedPending } = await setBorrowerPayerAccount(env.DB, borrowerId, {
      accountNumber: (await protectString("87654321", KEY))!,
      sortCode: (await protectString("040004", KEY))!,
    });
    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(detachedPending).toBe(1);
    expect(plaid.payers).toHaveLength(2);
    expect(plaid.payers[1]?.accountNumber).toBe("87654321");
  });

  it("never touches a mandate the borrower already approved", async () => {
    const plaid = new RecordingPlaid();
    const { borrowerId, consentId } = await borrower(false);
    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);
    await setConsentStatus(env.DB, consentId, "authorized");

    const { detachedPending } = await setBorrowerPayerAccount(env.DB, borrowerId, {
      accountNumber: (await protectString("87654321", KEY))!,
      sortCode: (await protectString("040004", KEY))!,
    });

    expect(detachedPending).toBe(0);
    expect((await getConsent(env.DB, consentId))?.plaid_consent_id).toBeTruthy();
  });
});
