import { describe, it, expect } from "vitest";
import { suggestCeilings } from "@/lib/ceilings";

describe("suggested ceilings follow the chosen period", () => {
  it("covers a whole year of weekly repayments when the period is a year", () => {
    const s = suggestCeilings(500, "weekly", "YEAR");
    expect(s.single).toBe(600);
    // 53 weeks plus one extra, never a single month's worth.
    expect(s.periodic).toBe(600 * 54);
  });

  it("gives a month a month's worth", () => {
    expect(suggestCeilings(500, "weekly", "MONTH").periodic).toBe(600 * 6);
  });

  it("is always at least the single payment ceiling", () => {
    for (const period of ["DAY", "WEEK", "MONTH", "YEAR"]) {
      for (const f of ["daily", "weekly", "fortnightly", "monthly", "custom"]) {
        const s = suggestCeilings(250, f, period);
        expect(s.periodic).toBeGreaterThanOrEqual(s.single);
      }
    }
  });

  it("a year's ceiling is never lower than a month's", () => {
    for (const f of ["daily", "weekly", "fortnightly", "monthly", "custom"]) {
      expect(suggestCeilings(100, f, "YEAR").periodic).toBeGreaterThan(suggestCeilings(100, f, "MONTH").periodic);
    }
  });
});
