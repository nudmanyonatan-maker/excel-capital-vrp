import { describe, it, expect } from "vitest";
import { earlyCollection } from "@/lib/early-collection";
import type { ScheduleSpec } from "@/lib/schedule";

// ASIAN UK SPA CONFINEMENT LTD: weekly on Tuesdays from 27 Oct, 19 payments.
const weekly: ScheduleSpec = {
  amountMinor: 161_100,
  frequency: "weekly",
  daysOfWeek: [2],
  startDate: "2026-10-27",
  endMode: "count",
  endCount: 19,
};

describe("collecting before the repayment is due", () => {
  it("names the due date and the one after, so the prompt can say both", () => {
    expect(earlyCollection(weekly, "2026-10-27", { paymentsMade: 0, collectedMinor: 0 }, "2026-10-20")).toEqual({
      dueDate: "2026-10-27",
      followingDate: "2026-11-03",
    });
  });

  it("says nothing when the repayment is due today", () => {
    expect(earlyCollection(weekly, "2026-10-27", { paymentsMade: 0, collectedMinor: 0 }, "2026-10-27")).toBeNull();
  });

  it("has no following date when this is the last payment", () => {
    expect(
      earlyCollection(weekly, "2027-03-02", { paymentsMade: 18, collectedMinor: 18 * 161_100 }, "2027-02-25")
        ?.followingDate,
    ).toBeNull();
  });
});
