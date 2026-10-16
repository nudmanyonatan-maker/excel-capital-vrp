import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FALLBACK_SETUP_FAILURE_ADVICE,
  SETUP_FAILURE_ADVICE,
  setupFailureAdvice,
} from "@/lib/setup-failure-advice";

describe("what staff are told to do about a failed bank connection", () => {
  it("never tells staff a cancelled consent always means the borrower backed out", () => {
    // NatWest reports its own error page as PAYMENT_CONSENT_CANCELLED.
    const advice = setupFailureAdvice("PAYMENT_CONSENT_CANCELLED");
    expect(advice).toMatch(/its own error page/);
    expect(advice).toMatch(/business account on file/);
  });

  it("explains a blocked bank connection in terms a rep can pass on", () => {
    expect(setupFailureAdvice("PLAID_SCRIPT_BLOCKED")).toMatch(/Safari or Chrome/);
  });

  it("falls back for codes it does not know, and for no code at all", () => {
    expect(setupFailureAdvice("SOMETHING_NEW")).toBe(FALLBACK_SETUP_FAILURE_ADVICE);
    expect(setupFailureAdvice(null)).toBe(FALLBACK_SETUP_FAILURE_ADVICE);
  });

  it("lists each code once", () => {
    const codes = SETUP_FAILURE_ADVICE.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("is the one source for both the borrower page and the Help page", () => {
    const read = (p: string) => readFileSync(path.join(__dirname, "..", "src", "app", "(dashboard)", p), "utf8");
    expect(read("borrowers/[id]/page.tsx")).toMatch(/setupFailureAdvice\(failure\.errorCode\)/);
    const help = read("help/page.tsx");
    expect(help).toMatch(/SETUP_FAILURE_ADVICE\.map/);
    expect(help).not.toMatch(/backed out at their bank/);
  });
});
