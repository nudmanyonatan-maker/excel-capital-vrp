import { describe, it, expect } from "vitest";
import { scheduledKey, retryKey, manualKey } from "@/lib/idempotency";

// Scenario eval #1: the same scheduled payment triggered twice yields the SAME
// key, so the DB UNIQUE constraint blocks the second attempt (no double-collect).
describe("scheduledKey", () => {
  it("is deterministic for the same borrower/schedule/due-date", () => {
    const a = scheduledKey("b1", "s1", "2026-02-01");
    const b = scheduledKey("b1", "s1", "2026-02-01");
    expect(a).toBe(b);
  });
  it("differs across due dates and borrowers", () => {
    expect(scheduledKey("b1", "s1", "2026-02-01")).not.toBe(scheduledKey("b1", "s1", "2026-03-01"));
    expect(scheduledKey("b1", "s1", "2026-02-01")).not.toBe(scheduledKey("b2", "s1", "2026-02-01"));
  });
});

// Scenario eval #3: a genuine retry is a DISTINCT attempt (new key allowed),
// but retrying the SAME failure twice must collide however the callers race.
describe("retryKey", () => {
  it("is stable for one failed attempt, whoever asks and whenever", () => {
    expect(retryKey("p1")).toBe(retryKey("p1"));
  });

  it("differs between the failures it replaces", () => {
    // A retry of the first attempt and a retry of that retry are separate
    // payments and must be allowed through as separate keys.
    expect(retryKey("p1")).not.toBe(retryKey("p2"));
  });

  it("does not depend on how many attempts came before", () => {
    // The old key mixed in a live COUNT of prior retries, read separately from
    // the query that picked the failure. Two overlapping sweeps could straddle
    // each other's insert, derive different attempt numbers for one failure, and
    // send it twice with nothing to collide on.
    const key = retryKey("p1");
    expect(key).toContain("p1");
    expect(key).not.toMatch(/_a\d+$/);
  });
});

describe("manualKey", () => {
  it("is unique per nonce", () => {
    expect(manualKey("b1", "n1")).not.toBe(manualKey("b1", "n2"));
  });
  // A stable per-render nonce makes double-submits idempotent.
  it("is stable for the same nonce (double-submit safety)", () => {
    expect(manualKey("b1", "n1")).toBe(manualKey("b1", "n1"));
  });
});
