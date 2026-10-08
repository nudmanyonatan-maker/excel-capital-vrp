import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TIPS } from "@/lib/help-text";
import { ROLE_INFO } from "@/lib/roles";

/**
 * The help is for people with nobody to ask, so it has to stay short and plain.
 * These keep a tooltip from growing into an essay and keep house style (no
 * em or en dashes) in everything a user reads.
 */
describe("help copy", () => {
  const texts = [
    ...Object.values(TIPS),
    ...Object.values(ROLE_INFO).flatMap((r) => [r.summary, ...r.can, ...r.cannot]),
    readFileSync(path.join(__dirname, "..", "src/app/(dashboard)/help/page.tsx"), "utf8"),
  ];

  it("uses no em or en dashes", () => {
    for (const t of texts) expect(t).not.toMatch(/[–—]/);
  });

  it("keeps every tooltip to a couple of sentences", () => {
    for (const [key, tip] of Object.entries(TIPS)) {
      expect(tip.length, key).toBeLessThanOrEqual(240);
    }
  });
});
