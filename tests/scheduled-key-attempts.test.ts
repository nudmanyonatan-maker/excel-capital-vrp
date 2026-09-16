import { describe, it, expect } from "vitest";
import { scheduledKey } from "@/lib/idempotency";

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
