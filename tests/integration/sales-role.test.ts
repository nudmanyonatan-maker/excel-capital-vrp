import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { createStaff, getStaffByEmail, listStaff, setStaffRole } from "@/lib/repo/staff";
import { decideRequest, requestAccess } from "@/lib/repo/access-requests";
import { createPayoutAccount, setSalesCanUse } from "@/lib/repo/payout-accounts";
import { choosePayoutAccount, payoutChoicesFor } from "@/lib/payout-accounts";
import { amountStartedBySince, createOrGetPaymentIntent } from "@/lib/repo/payment-intents";
import { createBorrower } from "@/lib/repo/borrowers";
import { protectString } from "@/lib/crypto";
import { SALES_DAILY_TEST_LIMIT_MINOR, TEST_AMOUNT_MINOR } from "@/lib/payment-limits";

const KEY = "test-encryption-key";
const email = (n: string) => `${n}-${crypto.randomUUID().slice(0, 8)}@sales.test`;

/**
 * staff_users.role cannot hold 'sales' (its CHECK cannot be widened on D1), so a
 * rep is stored as a viewer with a flag. These pin that the flag always comes
 * back as the real role, and that the stored form is the safe one.
 */
describe("storing a sales rep", () => {
  it("reads back as sales, stored as a viewer", async () => {
    const who = email("rep");
    const created = await createStaff(env.DB, who, "sales");
    expect(created.role).toBe("sales");

    const raw = await env.DB.prepare("SELECT role, is_sales FROM staff_users WHERE id = ?")
      .bind(created.id)
      .first<{ role: string; is_sales: number }>();
    expect(raw).toEqual({ role: "viewer", is_sales: 1 });
    expect((await listStaff(env.DB)).find((s) => s.id === created.id)?.role).toBe("sales");
  });

  it("clears the flag when a rep is promoted", async () => {
    const who = email("promoted");
    const rep = await createStaff(env.DB, who, "sales");
    await setStaffRole(env.DB, rep.id, "operator");
    expect((await getStaffByEmail(env.DB, who))?.role).toBe("operator");

    await setStaffRole(env.DB, rep.id, "viewer");
    expect((await getStaffByEmail(env.DB, who))?.role).toBe("viewer");
  });

  it("can be granted from the access request queue", async () => {
    const who = email("asked");
    const request = await requestAccess(env.DB, who, "new sales rep");
    await decideRequest(env.DB, { id: request.id, approve: true, role: "sales", decidedBy: null });
    expect((await getStaffByEmail(env.DB, who))?.role).toBe("sales");
  });
});

describe("which accounts a rep may choose", () => {
  async function account(label: string, openToSales: boolean) {
    const a = await createPayoutAccount(env.DB, {
      label,
      name: "Excel Capital",
      accountNumber: (await protectString(`7${String(Math.random()).slice(2, 9)}`, KEY))!,
      sortCode: (await protectString("123456", KEY))!,
      createdBy: null,
    });
    if (openToSales) await setSalesCanUse(env.DB, a.id, true);
    return a;
  }

  it("offers a rep only the accounts opened to sales", async () => {
    const open = await account(`Open ${crypto.randomUUID()}`, true);
    const closed = await account(`Closed ${crypto.randomUUID()}`, false);
    const rep = await createStaff(env.DB, email("picker"), "sales");
    const op = await createStaff(env.DB, email("op"), "operator");

    const repIds = (await payoutChoicesFor(env.DB, rep, KEY)).map((c) => c.id);
    expect(repIds).toContain(open.id);
    expect(repIds).not.toContain(closed.id);

    const opIds = (await payoutChoicesFor(env.DB, op, KEY)).map((c) => c.id);
    expect(opIds).toEqual(expect.arrayContaining([open.id, closed.id]));
  });

  it("refuses a closed account even if the form names it", async () => {
    const closed = await account(`Closed ${crypto.randomUUID()}`, false);
    const rep = await createStaff(env.DB, email("sneaky"), "sales");
    expect((await choosePayoutAccount(env.DB, rep, closed.id)).ok).toBe(false);
  });
});

describe("the £1 test limit", () => {
  it("is £1 a test and £5 a day", () => {
    expect(TEST_AMOUNT_MINOR).toBe(100);
    expect(SALES_DAILY_TEST_LIMIT_MINOR).toBe(500);
  });

  it("counts what this person started in the window, and nobody else's", async () => {
    const rep = await createStaff(env.DB, email("tester"), "sales");
    const other = await createStaff(env.DB, email("other"), "sales");
    const b = await createBorrower(env.DB, { legalName: `Test Limit ${crypto.randomUUID()} Ltd`, createdBy: null });
    const intent = (by: string, key: string) =>
      createOrGetPaymentIntent(env.DB, {
        borrowerId: b.id,
        kind: "manual",
        amountMinor: TEST_AMOUNT_MINOR,
        currency: "GBP",
        reference: "TEST",
        idempotencyKey: key,
        createdBy: by,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    const since = new Date(Date.now() - 60_000).toISOString();

    await intent(rep.id, `t-${crypto.randomUUID()}`);
    await intent(rep.id, `t-${crypto.randomUUID()}`);
    await intent(other.id, `t-${crypto.randomUUID()}`);
    const cancelled = await intent(rep.id, `t-${crypto.randomUUID()}`);
    await env.DB.prepare("UPDATE payment_intents SET status = 'cancelled' WHERE id = ?")
      .bind(cancelled.id)
      .run();

    expect(await amountStartedBySince(env.DB, rep.id, since)).toBe(200);
    expect(await amountStartedBySince(env.DB, rep.id, new Date(Date.now() + 60_000).toISOString())).toBe(0);
  });
});
