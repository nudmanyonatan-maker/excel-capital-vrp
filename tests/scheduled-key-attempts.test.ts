import { describe, it, expect } from "vitest";
import { scheduledKey, retryKey, manualKey } from "@/lib/idempotency";

/**
 * A GBP 0.01 collection was refused by Plaid for being under their GBP 1.00
 * minimum. It created nothing, but Plaid still remembered the key. Correcting
 * the amount reused that key with a different amount and Plaid answered
 * "idempotency key reused with different payment parameters", so the instalment
 * could not be collected at all.
 */
describe("scheduledKey", () => {
  const args = ["bor1", "sch1", "2026-09-16"] as const;

  it("is unchanged when nothing has been refused", () => {
    // Keys for instalments already in flight must not move.
    expect(scheduledKey(...args)).toBe("sch_bor1_sch1_2026-09-16");
    expect(scheduledKey(...args, 0)).toBe("sch_bor1_sch1_2026-09-16");
  });

  it("is stable for a given attempt, so two runs of it still collide", () => {
    expect(scheduledKey(...args, 1)).toBe(scheduledKey(...args, 1));
  });

  it("differs once an attempt was refused without reaching the bank", () => {
    expect(scheduledKey(...args, 1)).not.toBe(scheduledKey(...args, 0));
  });

  it("keeps moving if a corrected attempt is refused again", () => {
    const keys = [0, 1, 2, 3].map((n) => scheduledKey(...args, n));
    expect(new Set(keys).size).toBe(4);
  });

  it("still separates instalments and borrowers", () => {
    expect(scheduledKey("bor1", "sch1", "2026-09-16", 1)).not.toBe(
      scheduledKey("bor1", "sch1", "2026-09-17", 1),
    );
    expect(scheduledKey("bor1", "sch1", "2026-09-16", 1)).not.toBe(
      scheduledKey("bor2", "sch1", "2026-09-16", 1),
    );
  });
});

/**
 * The retry key was first built with a "#" separator, and Plaid refused the
 * payment with "invalid idempotency key". To an operator that is a collection
 * that simply will not go, with nothing naming a character as the cause. The
 * keys are ours to choose, so they stay in the set every provider accepts.
 */
describe("idempotency keys are safe to send to a provider", () => {
  const SAFE = /^[A-Za-z0-9_-]+$/;

  it("holds for a scheduled key, with and without earlier refusals", () => {
    for (const n of [0, 1, 2, 9]) {
      expect(scheduledKey("bor-1", "sch-1", "2026-09-16", n)).toMatch(SAFE);
    }
  });

  it("holds for retry and manual keys", () => {
    expect(retryKey("3f1a2b4c-0000-4aaa-8bbb-ccccdddd0001")).toMatch(SAFE);
    expect(manualKey("bor-1", "9f1a2b4c-0000-4aaa-8bbb-ccccdddd0002")).toMatch(SAFE);
  });

  it("refuses to build a key a provider would reject", () => {
    // The guard is in clamp, so any future separator that slips outside the set
    // fails here rather than at the bank.
    expect(() => manualKey("bor#1", "nonce")).toThrow(/characters a provider may reject/);
  });
});
