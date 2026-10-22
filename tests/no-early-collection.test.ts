import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * "Execute payment now" pressed right after saving a new schedule took the
 * first repayment a week early, twice in one week (20 and 22 Oct 2026): staff
 * expected it to start the schedule. It now refuses anything not yet due.
 *
 * Source-level, like the other action guards: running the action needs a full
 * request context the Workers pool cannot provide.
 */
describe("Execute payment now never collects ahead of the due date", () => {
  const source = readFileSync(path.join(__dirname, "..", "src/lib/actions/payments.ts"), "utf8");

  it("refuses a scheduled run that is not due yet", () => {
    expect(source).toMatch(/if \(isScheduledRun && collectingAhead\) \{[\s\S]{0,600}?return \{/);
  });

  it("refuses before anything is prepared or sent", () => {
    const guard = source.indexOf("if (isScheduledRun && collectingAhead)");
    expect(guard).toBeGreaterThan(-1);
    expect(source.indexOf("createOrGetPaymentIntent(")).toBeGreaterThan(guard);
  });
});
