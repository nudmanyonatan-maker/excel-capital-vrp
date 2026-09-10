import { describe, it, expect } from "vitest";
import { toSpec, isStoredDaily } from "@/lib/repo/schedules";
import { addInterval } from "@/lib/schedule";

/**
 * A production borrower was set to "£162, custom, every 1 day" with Mon-Fri
 * ticked, and collected seven days a week. Choosing "custom" discarded the
 * weekday ticks, and because isStoredDaily requires days_of_week to be present,
 * the row read back as a bare interval that ignored weekdays. Nothing on any
 * screen said the operator's choice had been dropped.
 */
describe("a 1-day custom interval is daily", () => {
  const row = (days: string | null) => ({
    amount_minor: 16_200,
    frequency: "custom" as const,
    interval_days: 1,
    days_of_week: days,
    start_date: "2026-09-07",
    end_mode: "total" as const,
    end_date: null,
    end_count: null,
    end_total_minor: 4_500_000,
  });

  it("skips the weekend when weekdays are set", () => {
    const spec = toSpec(row("1,2,3,4,5"));
    // Friday 2026-09-11 -> Monday 2026-09-14, not Saturday.
    expect(addInterval("2026-09-11", spec)).toBe("2026-09-14");
  });

  it("collects every day when no weekdays are recorded", () => {
    // The shape Falconwood was in. Kept as a documented behaviour so the
    // difference between the two rows is visible rather than surprising.
    const spec = toSpec(row(null));
    expect(addInterval("2026-09-11", spec)).toBe("2026-09-12");
  });

  it("treats a stored 1-day custom row with days as daily", () => {
    expect(isStoredDaily(row("1,2,3,4,5"))).toBe(true);
    expect(toSpec(row("1,2,3,4,5")).frequency).toBe("daily");
  });
});
