import { env } from "cloudflare:workers";
import { describe, it, expect, beforeEach } from "vitest";
import { getSchedulePaymentCreatedOn } from "@/lib/repo/payments";
import { createBorrower } from "@/lib/repo/borrowers";
import { upsertSchedule } from "@/lib/repo/schedules";
import { newId } from "@/lib/ids";

let n = 0;

async function seed() {
  const b = await createBorrower(env.DB, { legalName: `Ahead ${n++} Ltd`, createdBy: null });
  const s = await upsertSchedule(
    env.DB,
    b.id,
    {
      amountMinor: 100,
      frequency: "monthly",
      startDate: "2026-09-11",
      endMode: "count",
      endCount: 1,
    },
    { today: "2026-09-11" },
  );
  return { borrowerId: b.id, scheduleId: s.id };
}

async function seedPayment(borrowerId: string, scheduleId: string, status: string) {
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO payments (id, borrower_id, schedule_id, idempotency_key, amount_minor,
       currency, reference, status, created_at, last_status_at)
     VALUES (?, ?, ?, ?, 100, 'GBP', 'REF', ?, '2026-09-11T11:15:33.000Z', '2026-09-11T11:15:40.000Z')`,
  )
    .bind(id, borrowerId, scheduleId, `k_${id}`, status)
    .run();
  return id;
}

/**
 * Two presses of "Execute payment now" two minutes apart took a September
 * instalment and an October one from a live borrower. The first press advances
 * next_run_date, so the second collected an instalment that was not due, and the
 * "already sent today" guard missed it because the bank had already rejected the
 * first one.
 */
describe("collecting ahead of the due date", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM payments").run();
  });

  it("ignores a rejected attempt when the instalment IS due, so it can be retried", async () => {
    const { borrowerId, scheduleId } = await seed();
    await seedPayment(borrowerId, scheduleId, "rejected");
    const found = await getSchedulePaymentCreatedOn(env.DB, scheduleId, "2026-09-11");
    expect(found).toBeNull();
  });

  it("counts a rejected attempt when collecting AHEAD, so the press cannot repeat", async () => {
    const { borrowerId, scheduleId } = await seed();
    await seedPayment(borrowerId, scheduleId, "rejected");
    const found = await getSchedulePaymentCreatedOn(env.DB, scheduleId, "2026-09-11", {
      includeUnsuccessful: true,
    });
    expect(found).not.toBeNull();
  });

  it("counts a live attempt either way", async () => {
    const { borrowerId, scheduleId } = await seed();
    await seedPayment(borrowerId, scheduleId, "initiated");
    expect(await getSchedulePaymentCreatedOn(env.DB, scheduleId, "2026-09-11")).not.toBeNull();
    expect(
      await getSchedulePaymentCreatedOn(env.DB, scheduleId, "2026-09-11", {
        includeUnsuccessful: true,
      }),
    ).not.toBeNull();
  });

  it("does not look at another day's attempts", async () => {
    const { borrowerId, scheduleId } = await seed();
    await seedPayment(borrowerId, scheduleId, "rejected");
    const found = await getSchedulePaymentCreatedOn(env.DB, scheduleId, "2026-09-12", {
      includeUnsuccessful: true,
    });
    expect(found).toBeNull();
  });
});
