import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const APP = path.join(__dirname, "..", "src", "app");

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return pageFiles(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * A server action that throws has nowhere to put the error when it is passed
 * straight to `<form action={...}>`: Next turns it into an unhandled exception
 * and the operator gets a blank "This page couldn't load" page. Operators hit
 * that repeatedly in production (a duplicate company number, a schedule with a
 * missing field), and every time the message they needed had already been
 * written and simply never reached them.
 *
 * So no page may hand a bare *Action to a form. They go through a wrapper that
 * returns the refusal as state, which ActionForm renders.
 */
describe("no form hands a throwing action straight to Next", () => {
  it("finds pages to scan", () => {
    expect(pageFiles(APP).length).toBeGreaterThan(5);
  });

  it("uses a reporting wrapper, never a bare throwing action", () => {
    const offenders: string[] = [];
    for (const file of pageFiles(APP)) {
      const src = readFileSync(file, "utf8");
      // A bare action ending in "Action" that is not a *FormAction wrapper.
      for (const m of src.matchAll(/<form[^>]*\saction=\{(\w+Action)\}/g)) {
        if (!m[1].endsWith("FormAction")) {
          offenders.push(`${path.relative(APP, file)}: ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
