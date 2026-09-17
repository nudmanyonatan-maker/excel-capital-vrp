import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const resume = readFileSync(
  path.join(__dirname, "..", "src/components/setup-resume.tsx"),
  "utf8",
);
const launcher = readFileSync(
  path.join(__dirname, "..", "src/components/setup-launcher.tsx"),
  "utf8",
);

/**
 * Plaid's dashboard showed three Link errors against this integration. Two were
 * ours, and both live in the bank-redirect return page:
 *
 *   OAUTH_STATE_ID_ALREADY_PROCESSED, because the stored handoff was cleared
 *   only after a successful callback, so refreshing the return page replayed a
 *   redirect the provider had already consumed.
 *
 *   INVALID_LINK_TOKEN, because a stored link token was re-used past the four
 *   hours Plaid keeps it valid for, which reads to the borrower as their bank
 *   refusing them.
 */
describe("the bank-redirect handoff", () => {
  it("is consumed before Link is created, not after it succeeds", () => {
    const readIndex = resume.indexOf("sessionStorage.getItem(SETUP_RESUME_KEY)");
    const removeIndex = resume.indexOf("sessionStorage.removeItem(SETUP_RESUME_KEY)");
    const createIndex = resume.indexOf("window.Plaid?.create");
    expect(readIndex).toBeGreaterThan(-1);
    expect(removeIndex).toBeGreaterThan(readIndex);
    expect(removeIndex).toBeLessThan(createIndex);
  });

  it("is not cleared inside onSuccess, where a reload never reaches it", () => {
    const onSuccess = resume.slice(resume.indexOf("onSuccess:"), resume.indexOf("onExit:"));
    expect(onSuccess).not.toContain("removeItem");
  });

  it("is stamped when written so the return page can age it out", () => {
    expect(launcher).toContain("storedAt");
  });

  it("refuses a handoff older than the token's four hour life", () => {
    expect(resume).toContain("FOUR_HOURS_MS");
    expect(resume).toMatch(/expired/i);
  });
});
