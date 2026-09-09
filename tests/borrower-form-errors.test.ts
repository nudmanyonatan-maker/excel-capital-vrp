import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const NEW_PAGE = path.join(ROOT, "src/app/(dashboard)/borrowers/new/page.tsx");
const ACTIONS = path.join(ROOT, "src/lib/actions/borrowers.ts");

/**
 * createBorrowerAction refuses bad input by throwing, and a plain
 * `<form action={serverAction}>` has nowhere to put a thrown Error: Next turns
 * it into an unhandled server exception and the operator gets a blank
 * "This page couldn't load. A server error occurred." page.
 *
 * That happened in production. Staff entered a company number that was already
 * onboarded and hit an unexplained error page four times, while the action was
 * holding the sentence "... is already onboarded under company number 16703081"
 * that nobody ever saw.
 *
 * These are source-level guards on purpose. Executing the action in a test means
 * importing next/navigation, which the Workers test pool cannot resolve, so the
 * cheap check that the wiring has not regressed is worth more than no check.
 */
describe("the new borrower form reports why it refused", () => {
  it("does not hand a throwing action straight to a form", () => {
    const page = readFileSync(NEW_PAGE, "utf8");
    expect(page).not.toMatch(/<form\s+action=\{createBorrowerAction\}/);
  });

  it("submits through the wrapper that renders the message", () => {
    const page = readFileSync(NEW_PAGE, "utf8");
    expect(page).toContain("BorrowerCreateForm");
  });

  it("has a wrapper that returns the error text instead of throwing it", () => {
    const actions = readFileSync(ACTIONS, "utf8");
    expect(actions).toContain("createBorrowerFormAction");
    // A caught redirect would turn every successful creation into an error
    // banner, with the borrower created and the operator told it failed.
    expect(actions).toContain("NEXT_REDIRECT");
  });

  it("still refuses a duplicate company number before writing anything", () => {
    // The guard must stay ahead of createBorrower, or a rejected duplicate
    // leaves a half-made borrower behind.
    const actions = readFileSync(ACTIONS, "utf8");
    const guard = actions.indexOf("findBorrowerByCompanyNumber");
    const write = actions.indexOf("const borrower = await createBorrower(");
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(guard);
  });
});
