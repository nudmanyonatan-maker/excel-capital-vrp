import { env } from "cloudflare:workers";
import { describe, it, expect, beforeEach } from "vitest";
import { MockPlaidClient } from "@/lib/plaid/mock";
import { collectPayment } from "@/lib/engine/collect";
import { createBorrower } from "@/lib/repo/borrowers";
import { addRecipient } from "@/lib/repo/destinations";
import { createPendingConsent, setConsentStatus } from "@/lib/repo/consents";
import { upsertSchedule } from "@/lib/repo/schedules";
import { unsentAttemptsForDueDate } from "@/lib/repo/payments";
import { scheduledKey } from "@/lib/idempotency";
import { encryptString } from "@/lib/crypto";

const KEY = "test-encryption-key";
const DUE = "2026-09-16";
let n = 0;

async function seed() {
  const b = await createBorrower(env.DB, { legalName: `Correct ${n++} Ltd`, createdBy: null });
  const r = await addRecipient(env.DB, b.id, {
    name: "Excel Capital",
    accountNumber: "12345678",
    sortCode: "123456",
  });
  const c = await createPendingConsent(env.DB, b.id, {
    recipientId: r.id,
    maxPaymentAmountMinor: 1_000_000,
    periodicMaxAmountMinor: 24_000_000,
    period: "MONTH",
  });
  await env.DB.prepare("UPDATE consents SET plaid_consent_id = ? WHERE id = ?")
    .bind(await encryptString("plaid-consent-id", KEY), c.id)
    .run();
  await setConsentStatus(env.DB, c.id, "authorized");
  await env.DB.prepare("UPDATE borrowers SET status = 'active' WHERE id = ?").bind(b.id).run();
  const s = await upsertSchedule(
    env.DB,
    b.id,
    { amountMinor: 100, frequency: "daily", startDate: DUE, endMode: "count", endCount: 3 },
    { today: DUE },
  );
  return { borrowerId: b.id, scheduleId: s.id };
}

/**
 * The whole sequence that played out in production over two days, on one
 * borrower, as a single test.
 *
 * An operator set a GBP 0.01 test collection. Plaid refused it for being under
 * their GBP 1.00 minimum, having created nothing. The operator corrected it to
 * GBP 1.00 and could not collect at all: first our own table reported the
 * instalment as already sent, then Plaid refused the key as reused with
 * different parameters, then refused the replacement key's characters. Three
 * separate refusals, none of which any test could reach, because the mock
 * accepted everything.
 */
describe("correcting an amount the provider refused", () => {
  const plaid = new MockPlaidClient();

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM payments").run();
  });

  it("refuses the under-minimum attempt without creating a payment at the bank", async () => {
    const { borrowerId, scheduleId } = await seed();
    const out = await collectPayment(env.DB, plaid, KEY, {
      borrowerId,
      amountMinor: 1,
      reference: "REF1",
      idempotencyKey: scheduledKey(borrowerId, scheduleId, DUE),
      scheduleId,
      scheduledFor: DUE,
      actorStaffId: null,
    });
    expect(out.kind).toBe("failed");
    if (out.kind === "failed") {
      expect(out.reason).toContain("must be >= 100");
      expect(out.payment.plaid_payment_id).toBeNull();
    }
  });

  it("then collects the corrected amount for the same instalment", async () => {
    const { borrowerId, scheduleId } = await seed();

    const first = await collectPayment(env.DB, plaid, KEY, {
      borrowerId,
      amountMinor: 1,
      reference: "REF1",
      idempotencyKey: scheduledKey(borrowerId, scheduleId, DUE),
      scheduleId,
      scheduledFor: DUE,
      actorStaffId: null,
    });
    expect(first.kind).toBe("failed");

    // The refused attempt gave its key back, so the corrected one gets its own.
    const unsent = await unsentAttemptsForDueDate(env.DB, scheduleId, DUE);
    expect(unsent).toBe(1);

    const second = await collectPayment(env.DB, plaid, KEY, {
      borrowerId,
      amountMinor: 100,
      reference: "REF2",
      idempotencyKey: scheduledKey(borrowerId, scheduleId, DUE, unsent),
      scheduleId,
      scheduledFor: DUE,
      actorStaffId: null,
    });

    // This is the assertion the operator cared about for two days.
    expect(second.kind).toBe("collected");
  });

  it("would have caught the reused key: the OLD key is still refused", async () => {
    const { borrowerId, scheduleId } = await seed();
    const key = scheduledKey(borrowerId, scheduleId, DUE);
    await collectPayment(env.DB, plaid, KEY, {
      borrowerId,
      amountMinor: 100,
      reference: "REF1",
      idempotencyKey: key,
      scheduleId,
      scheduledFor: DUE,
      actorStaffId: null,
    });
    // Same key, different amount: Plaid refuses this, and so must the mock.
    const again = await collectPayment(env.DB, plaid, KEY, {
      borrowerId,
      amountMinor: 200,
      reference: "REF1",
      idempotencyKey: key,
      scheduleId,
      scheduledFor: DUE,
      actorStaffId: null,
    });
    expect(again.kind).toBe("duplicate");
  });
});
