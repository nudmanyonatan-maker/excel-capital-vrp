import { describe, it, expect } from "vitest";
import { projectCollections, lastMonths, plainFailureReason, resolvePeriod, percentChange } from "@/lib/overview";
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

describe("choosing a period", () => {
  const today = "2026-10-20";

  it("defaults to this month so far, compared with the same days last month", () => {
    expect(resolvePeriod(undefined, today)).toMatchObject({
      key: "month",
      from: "2026-10-01",
      to: "2026-10-20",
      prevFrom: "2026-09-01",
      prevTo: "2026-09-20",
    });
  });

  it("takes a whole past month, compared with the month before", () => {
    expect(resolvePeriod("2026-09", today)).toMatchObject({
      key: "2026-09",
      label: "September 2026",
      from: "2026-09-01",
      to: "2026-09-30",
      prevFrom: "2026-08-01",
      prevTo: "2026-08-31",
    });
  });

  it("takes the last N days, compared with the N days before", () => {
    expect(resolvePeriod("30d", today)).toMatchObject({
      from: "2026-09-21",
      to: "2026-10-20",
      prevFrom: "2026-08-22",
      prevTo: "2026-09-20",
    });
  });

  it("clamps a short month when comparing month to date", () => {
    expect(resolvePeriod("month", "2026-03-31")).toMatchObject({ prevFrom: "2026-02-01", prevTo: "2026-02-28" });
  });

  it("has nothing to compare all time with", () => {
    expect(resolvePeriod("all", today)).toMatchObject({ from: "0000-01-01", prevFrom: null });
  });

  it("ignores a month in the future or nonsense, falling back to this month", () => {
    expect(resolvePeriod("2027-01", today).key).toBe("month");
    expect(resolvePeriod("drop table", today).key).toBe("month");
  });
});

describe("percentage change", () => {
  it("is null with nothing to compare against", () => {
    expect(percentChange(500, 0)).toBeNull();
  });
  it("rounds to a whole percent", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(66, 100)).toBe(-34);
  });
});
