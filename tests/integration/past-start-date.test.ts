import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { MockPlaidClient } from "@/lib/plaid/mock";
import type { ConsentConstraints, CreateConsentResult, GetConsentResult } from "@/lib/plaid";
import { provisionLinkToken } from "@/lib/engine/setup";
import { createBorrower } from "@/lib/repo/borrowers";
import { addRecipient } from "@/lib/repo/destinations";
import { attachPlaidConsent, createPendingConsent, getConsent } from "@/lib/repo/consents";
import { latestAuditEntry } from "@/lib/repo/audit";
import { encryptString, protectString, sha256Hex } from "@/lib/crypto";

const KEY = "test-encryption-key";
const ENV = { PLAID_WEBHOOK_URL: undefined, APP_BASE_URL: undefined };
const DAY = 24 * 60 * 60_000;

class RecordingPlaid extends MockPlaidClient {
  created: ConsentConstraints[] = [];
  constructor(private bankStatus = "UNAUTHORISED") {
    super();
  }
  override async createConsent(
    _recipientId: string,
    _reference: string,
    constraints: ConsentConstraints,
  ): Promise<CreateConsentResult> {
    this.created.push(constraints);
    return { consentId: `dated-${crypto.randomUUID()}`, rawConstraints: constraints };
  }
  override async getConsent(consentId: string): Promise<GetConsentResult> {
    return { consentId, status: this.bankStatus };
  }
}

let n = 0;
/** A mandate shaped like Medway Licensed Taxis': a start date that has already passed. */
async function datedMandate(validFrom: string, opts: { sentAs?: string } = {}) {
  const b = await createBorrower(env.DB, { legalName: `Dated ${n++} Ltd`, createdBy: null });
  const recipient = await addRecipient(env.DB, b.id, {
    name: "Excel Capital",
    accountNumber: await protectString("11112222", KEY),
    sortCode: await protectString("334455", KEY),
  });
  const consent = await createPendingConsent(env.DB, b.id, {
    recipientId: recipient.id,
    maxPaymentAmountMinor: 1_000_000,
    periodicMaxAmountMinor: 20_000_000,
    period: "MONTH",
    validFrom,
    validTo: new Date(Date.now() + 365 * DAY).toISOString(),
  });
  if (opts.sentAs) {
    const plaidId = `${opts.sentAs}-${crypto.randomUUID()}`;
    await attachPlaidConsent(env.DB, consent.id, {
      plaidConsentIdEncrypted: await encryptString(plaidId, KEY),
      plaidConsentIdHash: await sha256Hex(plaidId),
      plaidRecipientId: "r",
      rawConstraints: { valid_date_time: { from: new Date(validFrom).toISOString() } },
    });
    await env.DB.prepare("UPDATE recipients SET plaid_recipient_id = 'r' WHERE id = ?").bind(recipient.id).run();
  }
  return { borrowerId: b.id, consentId: consent.id };
}

/**
 * Medway Licensed Taxis failed at NatWest and Lloyds with
 * PAYMENT_INVALID_SCHEDULE. Its mandate reached the bank with a start date a
 * day before the borrower opened their link. Every approved mandate with dates
 * had started in the future.
 */
describe("a mandate's start date is never in the past when it reaches the bank", () => {
  it("drops a start date that has already passed", async () => {
    const plaid = new RecordingPlaid();
    const { borrowerId } = await datedMandate(new Date(Date.now() - DAY).toISOString());

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.created[0].validFrom).toBeNull();
    expect(plaid.created[0].validTo).toBeTruthy();
  });

  it("keeps a start date still in the future", async () => {
    const plaid = new RecordingPlaid();
    const future = new Date(Date.now() + DAY).toISOString();
    const { borrowerId } = await datedMandate(future);

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.created[0].validFrom).toBe(future);
  });

  it("re-issues a mandate already sent with a past start, once", async () => {
    const plaid = new RecordingPlaid("UNAUTHORISED");
    const { borrowerId, consentId } = await datedMandate(new Date(Date.now() - DAY).toISOString(), {
      sentAs: "medway",
    });

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);
    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.created).toHaveLength(1);
    expect(plaid.created[0].validFrom).toBeNull();
    const raw = JSON.parse((await getConsent(env.DB, consentId))!.raw_constraints!);
    expect(raw.valid_date_time?.from).toBeUndefined();
    expect(await latestAuditEntry(env.DB, "consent.reissued", "borrower", borrowerId)).not.toBeNull();
  });

  it("never re-issues one the bank already approved", async () => {
    const plaid = new RecordingPlaid("AUTHORISED");
    const { borrowerId } = await datedMandate(new Date(Date.now() - DAY).toISOString(), { sentAs: "live" });

    await provisionLinkToken(env.DB, plaid, KEY, ENV, borrowerId);

    expect(plaid.created).toHaveLength(0);
  });
});
