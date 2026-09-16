import { env } from "cloudflare:workers";
import { describe, it, expect, beforeEach } from "vitest";
import { releaseUnsentIdempotencyKey } from "@/lib/repo/payments";
import { createBorrower } from "@/lib/repo/borrowers";
import { newId } from "@/lib/ids";

let n = 0;

async function seed(status: string, plaidId: string | null, key: string) {
  const b = await createBorrower(env.DB, { legalName: `Unsent ${n++} Ltd`, createdBy: null });
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO payments (id, borrower_id, idempotency_key, amount_minor, currency,
       reference, status, plaid_payment_id, created_at)
     VALUES (?, ?, ?, 1, 'GBP', 'REF', ?, ?, '2026-09-16T14:37:02.000Z')`,
  )
    .bind(id, b.id, key, status, plaidId)
    .run();
  return id;
}

async function keyOf(id: string): Promise<string> {
  const row = await env.DB.prepare("SELECT idempotency_key k FROM payments WHERE id = ?")
    .bind(id)
    .first<{ k: string }>();
  return row!.k;
}

/**
 * A GBP 0.01 collection was refused by Plaid for being under their GBP 1.00
 * minimum. It never reached the bank, but it held the deterministic key for that
 * day's instalment, so correcting the amount and trying again collided and came
 * back as "already sent". The instalment became uncollectable with no
 * explanation.
 */
describe("the key held by an attempt that never reached the bank", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM payments").run();
  });

  it("is released when the provider refused the request outright", async () => {
    const id = await seed("rejected", null, "sch_b_s_2026-09-16");
    expect(await releaseUnsentIdempotencyKey(env.DB, id)).toBe(true);
    expect(await keyOf(id)).toBe(`unsent:${id}`);
  });

  it("frees the canonical key for a corrected retry of the same instalment", async () => {
    const id = await seed("rejected", null, "sch_b_s_2026-09-16");
    await releaseUnsentIdempotencyKey(env.DB, id);
    // The whole point: the same deterministic key can now be inserted again.
    const retry = newId();
    await env.DB.prepare(
      `INSERT INTO payments (id, borrower_id, idempotency_key, amount_minor, currency,
         reference, status, created_at)
       SELECT ?, borrower_id, 'sch_b_s_2026-09-16', 100, 'GBP', 'REF', 'pending', '2026-09-16T16:54:00.000Z'
         FROM payments WHERE id = ?`,
    )
      .bind(retry, id)
      .run();
    expect(await keyOf(retry)).toBe("sch_b_s_2026-09-16");
  });

  it("NEVER releases a payment the provider did create", async () => {
    // A bank refusal is 'failed' and the payment exists, so repeating its key
    // could charge the borrower twice.
    const id = await seed("failed", "payment-id-production-abc", "sch_b_s_2026-09-16");
    expect(await releaseUnsentIdempotencyKey(env.DB, id)).toBe(false);
    expect(await keyOf(id)).toBe("sch_b_s_2026-09-16");
  });

  it("NEVER releases an unknown attempt, where nothing is proven", async () => {
    const id = await seed("unknown", null, "sch_b_s_2026-09-16");
    expect(await releaseUnsentIdempotencyKey(env.DB, id)).toBe(false);
    expect(await keyOf(id)).toBe("sch_b_s_2026-09-16");
  });

  it("NEVER releases a rejected row that somehow carries a provider id", async () => {
    const id = await seed("rejected", "payment-id-production-xyz", "sch_b_s_2026-09-16");
    expect(await releaseUnsentIdempotencyKey(env.DB, id)).toBe(false);
  });

  it("is idempotent", async () => {
    const id = await seed("rejected", null, "sch_b_s_2026-09-16");
    expect(await releaseUnsentIdempotencyKey(env.DB, id)).toBe(true);
    expect(await releaseUnsentIdempotencyKey(env.DB, id)).toBe(false);
    expect(await keyOf(id)).toBe(`unsent:${id}`);
  });
});
