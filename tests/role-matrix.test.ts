import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { hasRole } from "@/lib/auth";
import { roleFromStored, storedRole, ROLES } from "@/lib/roles";
import type { Role, StaffUser } from "@/lib/types";

const ACTIONS_DIR = path.join(__dirname, "..", "src", "lib", "actions");

/**
 * The exact role every server action requires. Adding an action, or loosening
 * one, has to be a deliberate edit here, because each line is a statement about
 * who can do what with a borrower's money.
 *
 * The sales rep's whole surface is the "sales" lines: onboard, correct details,
 * choose an approved account and limits, send the setup link, send a £1 test.
 */
const EXPECTED: Record<string, Role | "public"> = {
  requestAccessAction: "public",
  completeSetupAction: "public",
  recordSetupErrorAction: "public",

  createBorrowerAction: "sales",
  createBorrowerFormAction: "sales",
  updateBorrowerDetailsAction: "sales",
  updateBorrowerDetailsFormAction: "sales",
  updateBankAndLimitsAction: "sales",
  updatePayerAccountAction: "sales",
  sendSetupLinkAction: "sales",
  sendTestPaymentAction: "sales",

  updateScheduleAction: "operator",
  updateScheduleFormAction: "operator",
  setBorrowerStatusAction: "operator",
  setBorrowerStatusFormAction: "operator",
  archiveBorrowerAction: "operator",
  restoreBorrowerAction: "operator",
  addDestinationAction: "operator",
  setDefaultDestinationAction: "operator",
  archiveDestinationAction: "operator",
  cancelMandateAction: "operator",
  executePaymentNowAction: "operator",
  retryPaymentAction: "operator",

  decideRequestAction: "admin",
  addStaffAction: "admin",
  setStaffRoleAction: "admin",
  setStaffDisabledAction: "admin",
  updateSettingsAction: "admin",
  updateSettingsFormAction: "admin",
  addPayoutAccountAction: "admin",
  archivePayoutAccountAction: "admin",
  adoptExistingAccountAction: "admin",
  setSalesCanUseAction: "admin",
};

function actualRoles(): Record<string, Role | "public"> {
  const found: Record<string, Role | "public"> = {};
  for (const file of readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    for (const [, name] of source.matchAll(/export async function (\w*Action)\b/g)) {
      const start = source.indexOf(`export async function ${name}`);
      const rest = source.slice(start + 1);
      const next = rest.indexOf("\nexport ");
      const body = next === -1 ? rest : rest.slice(0, next);
      const roles = [...new Set([...body.matchAll(/requireRole\("(\w+)"\)/g)].map((m) => m[1]))];
      // More than one distinct role in one action would make "who can do this"
      // ambiguous, so it is reported as a mismatch rather than picked between.
      found[name] = roles.length === 0 ? "public" : roles.length === 1 ? (roles[0] as Role) : ("mixed" as Role);
    }
  }
  return found;
}

describe("who can do what", () => {
  it("every action requires exactly the role listed", () => {
    expect(actualRoles()).toEqual(EXPECTED);
  });

  it("a sales rep can never schedule, collect, pause or archive", () => {
    const rep = { role: "sales" } as StaffUser;
    expect(hasRole(rep, "sales")).toBe(true);
    expect(hasRole(rep, "operator")).toBe(false);
    expect(hasRole(rep, "admin")).toBe(false);
  });

  it("a viewer cannot do what a sales rep can", () => {
    expect(hasRole({ role: "viewer" } as StaffUser, "sales")).toBe(false);
  });

  it("sales schedules nothing even when the form sends a schedule", () => {
    const source = readFileSync(path.join(ACTIONS_DIR, "borrowers.ts"), "utf8");
    const create = source.slice(
      source.indexOf("export async function createBorrowerAction"),
      source.indexOf("export async function updateScheduleAction"),
    );
    expect(create).toMatch(/startDate && hasRole\(user, "operator"\)/);
  });
});

const API_DIR = path.join(__dirname, "..", "src", "app", "api");

/**
 * The same statement for API routes. The action list above never saw these,
 * which is how the Companies House search stayed at "operator" when onboarding
 * moved to "sales": reps could open the form but every search said "Not
 * authorised." "staff" is any signed-in staff member (requireUser). "none"
 * means no staff check, because the route proves who is calling another way
 * (cron secret, Plaid signature, dev only, health).
 */
const EXPECTED_ROUTES: Record<string, Role | "staff" | "none"> = {
  "audit/export": "staff",
  "companies/search": "sales",
  "cron/run": "none",
  "dev-login": "none",
  "health": "none",
  "payments/export": "staff",
  "webhooks/plaid": "none",
};

function routeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return routeFiles(path.join(dir, entry.name), rel);
    return entry.name === "route.ts" ? [prefix] : [];
  });
}

function actualRouteRoles(): Record<string, Role | "staff" | "none" | "mixed"> {
  const found: Record<string, Role | "staff" | "none" | "mixed"> = {};
  for (const route of routeFiles(API_DIR)) {
    const source = readFileSync(path.join(API_DIR, route, "route.ts"), "utf8");
    const roles = new Set<string>([...source.matchAll(/requireRole\("(\w+)"\)/g)].map((m) => m[1]));
    if (/requireUser\(\)/.test(source)) roles.add("staff");
    found[route] = roles.size === 0 ? "none" : roles.size === 1 ? ([...roles][0] as Role) : "mixed";
  }
  return found;
}

describe("who can call which API route", () => {
  it("every route requires exactly the role listed", () => {
    expect(actualRouteRoles()).toEqual(EXPECTED_ROUTES);
  });

  it("the onboarding form's company search is open to the reps who use it", () => {
    expect(hasRole({ role: "sales" } as StaffUser, EXPECTED_ROUTES["companies/search"] as Role)).toBe(true);
  });
});

describe("storing the sales role", () => {
  it("round-trips every role", () => {
    for (const role of ROLES) {
      const stored = storedRole(role);
      expect(roleFromStored(stored.role, stored.isSales)).toBe(role);
    }
  });

  it("stores a rep as a viewer, so ignoring the flag fails safe", () => {
    expect(storedRole("sales")).toEqual({ role: "viewer", isSales: 1 });
    expect(roleFromStored("viewer", 0)).toBe("viewer");
  });

  it("never lets the flag lift anyone above viewer", () => {
    expect(roleFromStored("operator", 1)).toBe("operator");
    expect(roleFromStored("nonsense", 1)).toBe("viewer");
  });
});

describe("the test payment cannot be bent into a real collection", () => {
  const source = readFileSync(path.join(ACTIONS_DIR, "test-payment.ts"), "utf8");

  it("never reads an amount from the form", () => {
    expect(source).not.toMatch(/fd\.get\("amount"\)/);
  });

  it("never lets the form choose the account", () => {
    expect(source).not.toMatch(/destinationConsentId/);
    expect(source).toMatch(/resolveCollectionDestination\(db, borrowerId, null\)/);
  });

  it("never touches the repayment schedule", () => {
    expect(source).toMatch(/scheduleId: null/);
    expect(source).not.toMatch(/setScheduleNextRun|getActiveSchedule/);
  });
});
