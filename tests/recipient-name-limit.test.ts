import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBankAndLimits, MAX_RECIPIENT_NAME } from "@/lib/borrower-setup-input";

const valid = { accountNumber: "12345678", sortCode: "12-34-56" };

/**
 * A borrower's HSBC authorisation failed repeatedly showing only "Something
 * went wrong". The cause, confirmed by Plaid: HSBC refuses a payee name over 18
 * characters. Ours was "Excel Capital Group Ltd", 23. Nothing in Link, in the
 * API response, or on our own screens named the real problem, so the only way
 * to stop it recurring is to refuse the name at the point of entry.
 */
describe("payee name length", () => {
  it("is capped at 18, the limit Plaid confirmed for HSBC", () => {
    expect(MAX_RECIPIENT_NAME).toBe(18);
  });

  it("refuses the exact name that broke production, and says the length", () => {
    const r = parseBankAndLimits({ ...valid, recipientName: "Excel Capital Group Ltd" });
    expect(r.value).toBeUndefined();
    expect(r.errors.join(" ")).toContain("18 characters or fewer");
    expect(r.errors.join(" ")).toContain("23");
  });

  it("accepts a name of exactly 18", () => {
    // Asserts only on the name: the fixture omits the amount fields, which
    // raise their own unrelated errors.
    const r = parseBankAndLimits({ ...valid, recipientName: "A".repeat(18) });
    expect(r.errors.join(" ")).not.toContain("characters or fewer");
  });

  it("rejects 19", () => {
    const r = parseBankAndLimits({ ...valid, recipientName: "A".repeat(19) });
    expect(r.errors.join(" ")).toContain("characters or fewer");
  });

  it("still asks for a name when none is given, rather than complaining about length", () => {
    const r = parseBankAndLimits({ ...valid, recipientName: "   " });
    expect(r.errors.join(" ")).toContain("Enter the name");
    expect(r.errors.join(" ")).not.toContain("18 characters");
  });

  it("caps the borrower creation form too, not just the edit form", () => {
    // Two separate entry points write a payee name; capping one leaves the
    // other free to recreate the outage.
    const src = readFileSync(
      path.join(__dirname, "..", "src/lib/actions/borrowers.ts"),
      "utf8",
    );
    expect(src).toContain("MAX_RECIPIENT_NAME");
  });
});
