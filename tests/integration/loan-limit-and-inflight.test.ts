import { env } from "cloudflare:workers";
import { describe, it, expect, beforeEach } from "vitest";
import { MockPlaidClient } from "@/lib/plaid/mock";
import { runAutoRetries } from "@/lib/engine/auto-retry";
import { runDueCollections } from "@/lib/engine/cron";
import { createBorrower } from "@/lib/repo/borrowers";
import { addRecipient } from "@/lib/repo/destinations";
import { createPendingConsent, setConsentStatus } from "@/lib/repo/consents";
import { upsertSchedule, getScheduleById } from "@/lib/repo/schedules";
import { collectionProgress, settledProgress } from "@/lib/repo/payments";
import { encryptString } from "@/lib/crypto";
import { newId } from "@/lib/ids";

const KEY = "test-encryption-key";
const plaid = new MockPlaidClient();
const NOW = new Date("2026-07-17T12:00:00Z");

let n = 0;

/** A borrower with a live mandate and a GBP 100 loan taken in GBP 10 steps. */
async function seedLoan() {
  const b = await createBorrower(env.DB, { legalName: `Loan ${n++} Ltd`, createdBy: null });
  const r = await addRecipient(env.DB, b.id, {
    name: "Excel Capital",
    accountNumber: "12345678",
    sortCode: "123456",
  });
  const c = await createPendingConsent(env.DB, b.id, {
    recipientId: r.id,
    maxPaymentAmountMinor: 5_000,
    periodicMaxAmountMinor: 100_000,
    period: "MONTH",
  });
  const cipher = await encryptString("plaid-consent-id", KEY);
  await env.DB.prepare("UPDATE consents SET plaid_consent_id = ? WHERE id = ?")
    .bind(cipher, c.id)
    .run();
  await setConsentStatus(env.DB, c.id, "authorized");
  await env.DB.prepare("UPDATE borrowers SET status = 'active' WHERE id = ?").bind(b.id).run();

  const schedule = await upsertSchedule(
    env.DB,
    b.id,
    {
      amountMinor: 1_000,
      frequency: "daily",
      startDate: "2026-07-01",
      endMode: "total",
      endTotalMinor: 10_000,
    },
    { today: "2026-07-01" },
  );
  return { borrowerId: b.id, scheduleId: schedule.id, consentId: c.id };
}

/** Write a payment row directly, so its status can be pinned precisely. */
async function seedPayment(
  borrowerId: string,
  scheduleId: string | null,
  status: string,
  amountMinor = 1_000,
): Promise<string> {
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO payments (id, borrower_id, schedule_id, idempotency_key, amount_minor,
       currency, reference, status, created_at, last_status_at)
     VALUES (?, ?, ?, ?, ?, 'GBP', 'REF', ?, '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z')`,
  )
    .bind(id, borrowerId, scheduleId, `seed_${id}`, amountMinor, status)
    .run();
  return id;
}

describe("a loan whose last payment is still in flight", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM payments").run();
  });

  it("counts in-flight money when deciding how much more may be taken", async () => {
    const { borrowerId, scheduleId } = await seedLoan();
    await seedPayment(borrowerId, scheduleId, "initiated");
    const committed = await collectionProgress(env.DB, borrowerId, scheduleId);
    expect(committed.collectedMinor).toBe(1_000);
  });

  it("does NOT count in-flight money when deciding the loan is finished", async () => {
    const { borrowerId, scheduleId } = await seedLoan();
    await seedPayment(borrowerId, scheduleId, "initiated");
    const settled = await settledProgress(env.DB, borrowerId, scheduleId);
    expect(settled.collectedMinor).toBe(0);
  });

  it("keeps the schedule alive when the final instalment has not settled", async () => {
    // The bug: GBP 90 settled plus GBP 10 in flight satisfied the GBP 100 end
    // condition, so the schedule was retired. A rejection afterwards left the
    // borrower GBP 10 short with nothing running and no screen explaining it.
    const { borrowerId, scheduleId } = await seedLoan();
    for (let i = 0; i < 9; i++) await seedPayment(borrowerId, scheduleId, "executed");
    await seedPayment(borrowerId, scheduleId, "initiated");

    await env.DB.prepare("UPDATE repayment_schedules SET next_run_date = ? WHERE id = ?")
      .bind("2026-07-17", scheduleId)
      .run();

    const summary = await runDueCollections(env.DB, plaid, KEY, "2026-07-17");
    expect(summary.ended).toBe(0);
    expect((await getScheduleById(env.DB, scheduleId))?.next_run_date).not.toBeNull();
  });

  it("does retire the schedule once the money has actually arrived", async () => {
    const { borrowerId, scheduleId } = await seedLoan();
    for (let i = 0; i < 10; i++) await seedPayment(borrowerId, scheduleId, "executed");
    await env.DB.prepare("UPDATE repayment_schedules SET next_run_date = ? WHERE id = ?")
      .bind("2026-07-17", scheduleId)
      .run();

    const summary = await runDueCollections(env.DB, plaid, KEY, "2026-07-17");
    expect(summary.ended).toBe(1);
    expect((await getScheduleById(env.DB, scheduleId))?.next_run_date).toBeNull();
  });
});

describe("retrying a failed instalment on a finished loan", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM payments").run();
    await env.DB.prepare(
      "UPDATE settings SET default_retry_max = 3, default_retry_spacing_hours = 24 WHERE id = 'singleton'",
    ).run();
  });

  it("does not ask the bank for money the borrower no longer owes", async () => {
    // The bug: a retry reused the amount of the attempt it replaced with no
    // reference to the loan's remaining balance, so a GBP 100 loan could see
    // GBP 200 in accepted payment requests.
    const { borrowerId, scheduleId } = await seedLoan();
    for (let i = 0; i < 10; i++) await seedPayment(borrowerId, scheduleId, "executed");
    await seedPayment(borrowerId, scheduleId, "failed");

    const before = await collectionProgress(env.DB, borrowerId, scheduleId);
    const summary = await runAutoRetries(env.DB, plaid, KEY, NOW);
    const after = await collectionProgress(env.DB, borrowerId, scheduleId);

    expect(summary.retried).toBe(0);
    expect(after.collectedMinor).toBe(before.collectedMinor);
    expect(after.collectedMinor).toBe(10_000);
  });

  it("still retries while the loan genuinely owes money", async () => {
    const { borrowerId, scheduleId } = await seedLoan();
    for (let i = 0; i < 5; i++) await seedPayment(borrowerId, scheduleId, "executed");
    await seedPayment(borrowerId, scheduleId, "failed");

    const summary = await runAutoRetries(env.DB, plaid, KEY, NOW);
    expect(summary.retried).toBe(1);
  });

  it("clamps the retry to the remainder rather than the original amount", async () => {
    // GBP 96 collected, a GBP 10 instalment failed: the retry may only ask for
    // the GBP 4 still outstanding.
    const { borrowerId, scheduleId } = await seedLoan();
    await seedPayment(borrowerId, scheduleId, "executed", 9_600);
    await seedPayment(borrowerId, scheduleId, "failed");

    await runAutoRetries(env.DB, plaid, KEY, NOW);
    const row = await env.DB.prepare(
      "SELECT amount_minor FROM payments WHERE borrower_id = ? AND retry_of IS NOT NULL",
    )
      .bind(borrowerId)
      .first<{ amount_minor: number }>();
    expect(row?.amount_minor).toBe(400);
  });
});
