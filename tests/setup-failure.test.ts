import { describe, it, expect } from "vitest";
import { failureStillRelevant } from "@/lib/setup-failure";

describe("the last failed bank connection", () => {
  it("is shown when the borrower has never approved", () => {
    expect(failureStillRelevant("2026-10-20T14:16:01.945Z", null)).toBe(true);
  });

  it("is hidden once they approved after it", () => {
    expect(failureStillRelevant("2026-10-20T14:16:01.945Z", "2026-10-20T15:13:44.866Z")).toBe(false);
  });

  it("is shown when it came after their last approval", () => {
    expect(failureStillRelevant("2026-10-21T09:00:00.000Z", "2026-10-20T15:13:44.866Z")).toBe(true);
  });
});
