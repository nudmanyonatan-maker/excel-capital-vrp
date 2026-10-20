import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { archiveBorrower, createBorrower } from "@/lib/repo/borrowers";
import { addRecipient } from "@/lib/repo/destinations";
import { createPendingConsent } from "@/lib/repo/consents";
import { upsertSchedule } from "@/lib/repo/schedules";
import { SETUP_FAILED_ACTION, writeAudit } from "@/lib/repo/audit";
import { loadOverview } from "@/lib/repo/overview";
import { newId } from "@/lib/ids";

// Far from any date another test writes, so only these rows land in the windows.
const NOW = new Date("2031-03-10T12:00:00Z");

let n = 0;
async function borrower(status: "active" | "onboarding" | "paused" = "active") {
  const b = await createBorrower(env.DB, { legalName: `OVERVIEW ${n++} LTD`, createdBy: null });
  await env.DB.prepare("UPDATE borrowers SET status = ? WHERE id = ?").bind(status, b.id).run();
  return b;
}

async function payment(
  borrowerId: string,
  status: string,
  amountMinor: number,
  createdAt: string,
  retryOf: string | null = null,
) {
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO payments (id, borrower_id, idempotency_key, amount_minor, currency, status, retry_of, created_at)
     VALUES (?, ?, ?, ?, 'GBP', ?, ?, ?)`,
  )
    .bind(id, borrowerId, `ov-${id}`, amountMinor, status, retryOf, createdAt)
    .run();
  return id;
}

describe("the overview's money", () => {
  it("adds up collected money by today, the last 7 days and this month", async () => {
    const b = await borrower();
    await payment(b.id, "executed", 10_000, "2031-03-10T09:00:00Z");
    await payment(b.id, "executed", 5_000, "2031-03-05T09:00:00Z");
    await payment(b.id, "settled", 2_000, "2031-03-01T09:00:00Z");
    await payment(b.id, "executed", 1_000, "2031-02-20T09:00:00Z");
    await payment(b.id, "initiated", 700, "2031-03-10T10:00:00Z");

    const o = await loadOverview(env.DB, NOW);

    expect(o.collected.today).toEqual({ count: 1, minor: 10_000 });
    expect(o.collected.last7Days).toEqual({ count: 2, minor: 15_000 });
    expect(o.collected.thisMonth).toEqual({ count: 3, minor: 17_000 });
    expect(o.inFlight.minor).toBeGreaterThanOrEqual(700);
    expect(o.byMonth.at(-1)).toEqual({ month: "2031-03", minor: 17_000, count: 3 });
    expect(o.byMonth.at(-2)).toEqual({ month: "2031-02", minor: 1_000, count: 1 });
  });

  it("leaves out archived borrowers", async () => {
    const before = await loadOverview(env.DB, NOW);
    const b = await borrower();
    await payment(b.id, "executed", 99_999, "2031-03-10T09:00:00Z");
    await archiveBorrower(env.DB, b.id);

    const after = await loadOverview(env.DB, NOW);

    expect(after.collected.today).toEqual(before.collected.today);
  });

  it("lists a failure still owed, and drops one a retry recovered", async () => {
    const before = await loadOverview(env.DB, NOW);
    const b = await borrower();
    const owed = await payment(b.id, "failed", 3_000, "2031-03-09T09:00:00Z");
    const recovered = await payment(b.id, "failed", 4_000, "2031-03-08T09:00:00Z");
    await payment(b.id, "executed", 4_000, "2031-03-09T10:00:00Z", recovered);

    const o = await loadOverview(env.DB, NOW);
    const ids = o.unrecovered.payments.map((u) => u.payment.id);

    expect(ids).toContain(owed);
    expect(ids).not.toContain(recovered);
    // The successful retry is money collected.
    expect(o.collected.last7Days.minor - before.collected.last7Days.minor).toBe(4_000);
  });
});

describe("the overview's coming collections", () => {
  it("counts an active borrower's schedule and skips a paused one", async () => {
    const active = await borrower("active");
    const paused = await borrower("paused");
    for (const b of [active, paused]) {
      const s = await upsertSchedule(
        env.DB,
        b.id,
        { amountMinor: 5_000, frequency: "weekly", startDate: "2031-03-12", endMode: "count", endCount: 10 },
        { today: "2031-03-10" },
      );
      await env.DB.prepare("UPDATE repayment_schedules SET next_run_date = '2031-03-12' WHERE id = ?")
        .bind(s.id)
        .run();
    }

    const o = await loadOverview(env.DB, NOW);
    const names = o.upcoming.days.flatMap((d) => d.items.map((i) => i.borrowerName));

    expect(names).toContain(active.legal_name);
    expect(names).not.toContain(paused.legal_name);
    expect(o.upcoming.days.find((d) => d.date === "2031-03-12")?.totalMinor).toBe(5_000);
  });
});

describe("the overview's borrowers waiting on setup", () => {
  it("names a borrower who has not approved, and their failed attempt since the last link", async () => {
    const b = await borrower("onboarding");
    const r = await addRecipient(env.DB, b.id, {
      name: "Excel Capital",
      accountNumber: "12345678",
      sortCode: "123456",
    });
    await createPendingConsent(env.DB, b.id, {
      recipientId: r.id,
      maxPaymentAmountMinor: 10_000,
      periodicMaxAmountMinor: 100_000,
      period: "MONTH",
    });
    await env.DB.prepare(
      `INSERT INTO setup_links (id, borrower_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, '2020-01-04T00:00:00Z', '2020-01-01T00:00:00Z')`,
    )
      .bind(newId(), b.id, `hash-${newId()}`)
      .run();
    await writeAudit(env.DB, {
      actorStaffId: null,
      action: SETUP_FAILED_ACTION,
      entityType: "borrower",
      entityId: b.id,
    });

    const o = await loadOverview(env.DB, NOW);
    const row = o.waiting.find((w) => w.borrowerId === b.id);

    expect(row?.whose).toBe("borrower");
    expect(row?.linkExpiresAt).toBe("2020-01-04T00:00:00Z");
    expect(row?.lastFailureAt).not.toBeNull();
  });
});
