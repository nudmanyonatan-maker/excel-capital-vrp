import { describe, it, expect } from "vitest";
import { projectCollections, lastMonths, plainFailureReason } from "@/lib/overview";
import type { ScheduleSpec } from "@/lib/schedule";

const weekdays: ScheduleSpec = {
  amountMinor: 7_364,
  frequency: "daily",
  daysOfWeek: [1, 2, 3, 4, 5],
  startDate: "2026-10-01",
  endMode: "count",
  endCount: 106,
};

/**
 * "What is due this week" has to follow the same calendar the nightly run does,
 * or the overview promises money the system will never ask for.
 */
describe("what is due in the coming days", () => {
  it("lists every run of a weekday schedule, skipping the weekend", () => {
    // Tuesday 20 Oct 2026, seven days ahead ends Monday 26 Oct.
    const runs = projectCollections(
      [{ key: "a", spec: weekdays, nextRunDate: "2026-10-20", paymentsMade: 10, collectedMinor: 73_640 }],
      "2026-10-20",
      7,
    );
    expect(runs.map((r) => r.date)).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-26",
    ]);
    expect(runs.every((r) => r.amountMinor === 7_364)).toBe(true);
  });

  it("stops when the schedule ends inside the window", () => {
    const runs = projectCollections(
      [{ key: "a", spec: weekdays, nextRunDate: "2026-10-20", paymentsMade: 104, collectedMinor: 0 }],
      "2026-10-20",
      7,
    );
    expect(runs).toHaveLength(2);
  });

  it("takes only the remainder on the last run of a total", () => {
    const spec: ScheduleSpec = {
      amountMinor: 50_000,
      frequency: "weekly",
      startDate: "2026-10-20",
      endMode: "total",
      endTotalMinor: 120_000,
    };
    const runs = projectCollections(
      [{ key: "a", spec, nextRunDate: "2026-10-20", paymentsMade: 2, collectedMinor: 100_000 }],
      "2026-10-20",
      14,
    );
    expect(runs.map((r) => r.amountMinor)).toEqual([20_000]);
  });

  it("counts an overdue run as due today, once", () => {
    const spec: ScheduleSpec = {
      amountMinor: 10_000,
      frequency: "monthly",
      startDate: "2026-09-15",
      endMode: "count",
      endCount: 12,
    };
    const runs = projectCollections(
      [{ key: "a", spec, nextRunDate: "2026-10-15", paymentsMade: 1, collectedMinor: 10_000 }],
      "2026-10-20",
      7,
    );
    expect(runs.map((r) => r.date)).toEqual(["2026-10-20"]);
  });

  it("leaves out a schedule with nothing due", () => {
    expect(projectCollections([{ key: "a", spec: weekdays, nextRunDate: null, paymentsMade: 0, collectedMinor: 0 }], "2026-10-20", 7)).toEqual([]);
  });
});

describe("the monthly trend", () => {
  it("lists the last six months oldest first, ending this month", () => {
    expect(lastMonths("2026-10-20", 6)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(lastMonths("2027-02-03", 3)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
});

describe("failure reasons in words", () => {
  it("says what the bank's code means", () => {
    expect(plainFailureReason("PAYMENT_STATUS_INSUFFICIENT_FUNDS")).toBe("Not enough money in their account");
    expect(plainFailureReason("PAYMENT_STATUS_REJECTED")).toBe("Refused by their bank");
    expect(plainFailureReason(null)).toBe("No reason given");
  });

  it("keeps an unknown reason short", () => {
    expect(plainFailureReason("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
