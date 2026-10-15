import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateSchedule } from "@/lib/repo/schedules";
import { validateConsentLimits } from "@/lib/repo/consents";

const ROOT = path.join(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/**
 * 15 of the first 27 production borrowers were half made. Creating one saved
 * the borrower, its business account and where repayments go, and only THEN
 * checked the schedule. A schedule the check refused (most often "After N
 * payments" with no number) threw after those writes, so the borrower existed
 * with no limits and no schedule, the form was wiped, and pressing Create again
 * hit "already onboarded". Every time, the operator went to Edit and typed the
 * limits in a second time.
 */
describe("creating a borrower checks everything before saving anything", () => {
  const actions = read("src/lib/actions/borrowers.ts");
  const firstWrite = actions.indexOf("const borrower = await createBorrower(");

  it("checks the schedule before the borrower is written", () => {
    const check = actions.indexOf("validateSchedule(");
    expect(check).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(check);
  });

  it("checks the limits before the borrower is written", () => {
    const check = actions.indexOf("validateConsentLimits(");
    expect(check).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(check);
  });

  it("refuses an 'after N payments' schedule with no number", () => {
    expect(() =>
      validateSchedule({
        amountMinor: 50_000,
        frequency: "weekly",
        startDate: "2026-11-02",
        endMode: "count",
        endCount: null,
      }),
    ).toThrow(/number of payments/i);
  });

  it("accepts a complete schedule", () => {
    expect(() =>
      validateSchedule({
        amountMinor: 50_000,
        frequency: "weekly",
        startDate: "2026-11-02",
        endMode: "count",
        endCount: 12,
      }),
    ).not.toThrow();
  });

  it("refuses limits that end before they start", () => {
    expect(() =>
      validateConsentLimits({
        maxPaymentAmountMinor: 60_000,
        periodicMaxAmountMinor: 300_000,
        validFrom: "2026-12-01T00:00",
        validTo: "2026-11-01T00:00",
      }),
    ).toThrow();
  });
});

describe("a refused new borrower keeps what was typed", () => {
  it("puts the fields back after React clears the form", () => {
    // React resets a form once its action finishes, even when the action
    // refused it, so without this every refusal meant typing it all again.
    const form = read("src/components/borrower-create-form.tsx");
    expect(form).toMatch(/onSubmit=/);
    expect(form).toMatch(/restoreFields\(/);
  });
});

/**
 * Borrowers onboarded before mandates were locked to the business account had
 * no way to be given one once they had approved: the Edit page swapped the
 * whole bank form for "These are locked in with the borrower's bank", business
 * account included.
 */
describe("an approved borrower can still be given a business account", () => {
  it("shows the business account form when the rest is locked", () => {
    const form = read("src/components/bank-limits-form.tsx");
    const lockedBranch = form.slice(form.indexOf("if (locked)"), form.indexOf("return (\n    <form"));
    expect(lockedBranch).toContain("<PayerAccountForm");
  });

  it("saves it through an action of its own", () => {
    const actions = read("src/lib/actions/bank-limits.ts");
    expect(actions).toMatch(/export async function updatePayerAccountAction/);
  });
});
