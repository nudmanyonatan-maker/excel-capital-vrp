import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { MockPlaidClient } from "@/lib/plaid/mock";
import { CONSENT_PERIOD_ALIGNMENT } from "@/lib/plaid";
import type { ConsentConstraints, CreateConsentResult, GetConsentResult } from "@/lib/plaid";
import { provisionLinkToken } from "@/lib/engine/setup";
import { createBorrower } from "@/lib/repo/borrowers";
import { addRecipient } from "@/lib/repo/destinations";
import {
  attachPlaidConsent,
  createPendingConsent,
  getConsent,
  setConsentStatus,
} from "@/lib/repo/consents";
import { latestAuditEntry } from "@/lib/repo/audit";
import { decryptString, encryptString, protectString, sha256Hex } from "@/lib/crypto";

const KEY = "test-encryption-key";
const ENV = { PLAID_WEBHOOK_URL: undefined, APP_BASE_URL: undefined };

/**
 * Records every consent it is asked to create, and answers status checks with
 * whatever the test says the bank currently holds.
 */
let instance = 0;
class RecordingPlaid extends MockPlaidClient {
  created: ConsentConstraints[] = [];
  /** Plaid ids are unique across the shared database, so every instance mints its own. */
  readonly prefix = `fresh-${instance++}`;
  constructor(private bankStatus: string | (() => never) = "UNAUTHORISED") {
    super();
  }
  override async createConsent(
    recipientId: string,
    reference: string,
    constraints: ConsentConstraints,
  ): Promise<CreateConsentResult> {
    this.created.push(constraints);
    return { consentId: `${this.prefix}-${this.created.length}`, rawConstraints: constraints };
  }
  override async getConsent(consentId: string): Promise<GetConsentResult> {
    if (typeof this.bankStatus === "function") this.bankStatus();
    return { consentId, status: this.bankStatus as string };
  }
}

let n = 0;

/** A borrower whose mandate was set up the old way, with CALENDAR alignment. */
async function seedCalendarMandate(opts: { provisionedAs?: string } = {}) {
  const b = await createBorrower(env.DB, { legalName: `Monzo ${n++} Ltd`, createdBy: null });
  const recipient = await addRecipient(env.DB, b.id, {
    name: "Excel Capital",
    label: "Main",
    accountNumber: await protectString("12345678", KEY),
    sortCode: await protectString("123456", KEY),
  });
  const consent = await createPendingConsent(env.DB, b.id, {
    recipientId: recipient.id,
    currency: "GBP",
    maxPaymentAmountMinor: 1_000_000,
    periodicMaxAmountMinor: 20_000_000,
    period: "MONTH",
  });
  // Rows written before this fix carry CALENDAR, which is what every existing
  // production mandate was created with.
  await env.DB.prepare("UPDATE consents SET periodic_alignment = 'CALENDAR' WHERE id = ?")
    .bind(consent.id)
    .run();
  const plaidId = opts.provisionedAs ? `${opts.provisionedAs}-${n}` : null;
  if (plaidId) {
    await attachPlaidConsent(env.DB, consent.id, {
      plaidConsentIdEncrypted: await encryptString(plaidId, KEY),
      plaidConsentIdHash: await sha256Hex(plaidId),
      plaidRecipientId: "old-recipient",
      rawConstraints: { periodic_amounts: [{ alignment: "CALENDAR" }] },
    });
    await env.DB.prepare("UPDATE recipients SET plaid_recipient_id = 'old-recipient' WHERE id = ?")
      .bind(recipient.id)
      .run();
  }
  return { borrowerId: b.id, consentId: consent.id, plaidId };
}

async function plaidIdOf(consentId: string): Promise<string | null> {
  const row = await getConsent(env.DB, consentId);
  return row?.plaid_consent_id ? decryptString(row.plaid_consent_id, KEY) : null;
}

/**
 * Plaid: "If the institution is Monzo, only CONSENT alignments are supported."
 * Every mandate was being created with CALENDAR, so every borrower who picked
 * Monzo was refused with PAYMENT_CONSENT_INVALID_CONSTRAINTS, ten times across
 * three borrowers before anyone could see why.
 */
describe("mandates a Monzo borrower can approve", () => {
  it("records every new mandate as CONSENT aligned", async () => {
    const b = await createBorrower(env.DB, { legalName: `Monzo ${n++} Ltd`, createdBy: null });
    const consent = await createPendingConsent(env.DB, b.id, {
      currency: "GBP",
      maxPaymentAmountMinor: 100,
      periodicMaxAmountMinor: 100,
      period: "MONTH",
    });
    expect(consent.periodic_alignment).toBe(CONSENT_PERIOD_ALIGNMENT);
  });

  it("asks the bank for CONSENT alignment even for a row written the old way", async () => {
    const { borrowerId, consentId } = await seedCalendarMandate();
    const plaid = new RecordingPlaid();

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.created).toHaveLength(1);
    expect(plaid.created[0].periodicAlignment).toBe("CONSENT");
    expect((await getConsent(env.DB, consentId))?.periodic_alignment).toBe("CONSENT");
  });

  it("replaces a CALENDAR mandate the bank has not approved, so reopening the link works", async () => {
    const { borrowerId, consentId } = await seedCalendarMandate({ provisionedAs: "old-calendar" });
    const plaid = new RecordingPlaid("UNAUTHORISED");

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.created).toHaveLength(1);
    expect(plaid.created[0].periodicAlignment).toBe("CONSENT");
    expect(await plaidIdOf(consentId)).toBe(`${plaid.prefix}-1`);
    const audit = await latestAuditEntry(env.DB, "consent.reissued", "borrower", borrowerId);
    expect(audit).not.toBeNull();
  });

  it("does it once: the next load reuses the replacement", async () => {
    const { borrowerId, consentId } = await seedCalendarMandate({ provisionedAs: "old-calendar" });
    const plaid = new RecordingPlaid("UNAUTHORISED");

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);
    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.created).toHaveLength(1);
    expect(await plaidIdOf(consentId)).toBe(`${plaid.prefix}-1`);
  });

  it("never replaces a mandate the bank already approved", async () => {
    // Approved at the bank but not yet recorded here. Swapping it out would leave
    // a live mandate we no longer hold the id for.
    const { borrowerId, consentId, plaidId } = await seedCalendarMandate({ provisionedAs: "old-live" });
    const plaid = new RecordingPlaid("AUTHORISED");

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.created).toHaveLength(0);
    expect(await plaidIdOf(consentId)).toBe(plaidId);
  });

  it("keeps the existing mandate when the bank cannot be asked", async () => {
    // Every bank but Monzo accepts the old mandate, so a provider blip must not
    // take the setup page down for everyone else.
    const { borrowerId, consentId, plaidId } = await seedCalendarMandate({
      provisionedAs: "old-calendar",
    });
    const plaid = new RecordingPlaid(() => {
      throw new Error("plaid unavailable");
    });

    const step = await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(step).not.toBeNull();
    expect(plaid.created).toHaveLength(0);
    expect(await plaidIdOf(consentId)).toBe(plaidId);
  });

  it("gives a re-consent after cancellation CONSENT alignment too", async () => {
    const { borrowerId, consentId } = await seedCalendarMandate({ provisionedAs: "old-calendar" });
    await setConsentStatus(env.DB, consentId, "revoked");
    const plaid = new RecordingPlaid();

    const step = await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(step?.consentRowId).not.toBe(consentId);
    expect(plaid.created[0].periodicAlignment).toBe("CONSENT");
    expect((await getConsent(env.DB, step!.consentRowId))?.periodic_alignment).toBe("CONSENT");
  });
});
