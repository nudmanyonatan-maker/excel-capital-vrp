import type { Role } from "@/lib/types";

/** Most powerful first, which is also the order pickers show them in. */
export const ROLES: Role[] = ["admin", "operator", "sales", "viewer"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

/**
 * What each role is for, in the words shown on the Staff page and in the help.
 *
 * Kept as the one description of the roles so the screen, the docs and the
 * checks cannot drift apart. The checks themselves live in the actions; the
 * role-matrix test asserts the two agree.
 */
export const ROLE_INFO: Record<Role, { name: string; summary: string; can: string[]; cannot: string[] }> = {
  admin: {
    name: "Admin",
    summary: "Runs the platform. Everything an operator can do, plus people and bank accounts.",
    can: [
      "Everything an operator can do",
      "Add and remove staff, and choose their role",
      "Add the bank accounts repayments can be paid into",
      "Choose which of those accounts sales reps can use",
      "Change settings",
    ],
    cannot: [],
  },
  operator: {
    name: "Operator",
    summary: "The accounts team. Onboards borrowers and runs collections.",
    can: [
      "Onboard borrowers and send setup links",
      "Choose any approved bank account for repayments",
      "Set and change repayment schedules",
      "Collect payments, take one-off payments, retry failed ones",
      "Pause, resume and archive borrowers",
    ],
    cannot: ["Add bank accounts or staff", "Change settings"],
  },
  sales: {
    name: "Sales rep",
    summary: "Sets borrowers up and checks the bank connection works. Never collects money.",
    can: [
      "Onboard borrowers: company, contact, limits",
      "Choose a bank account an admin has opened to sales",
      "Send the setup link to the borrower",
      "Send a £1 test payment once the borrower has approved (up to £5 a day)",
    ],
    cannot: [
      "Set or change repayment schedules",
      "Collect payments or take one-off payments",
      "Pause, resume or archive borrowers",
      "Type in a bank account number",
    ],
  },
  viewer: {
    name: "Viewer",
    summary: "Can look at everything and change nothing.",
    can: ["See borrowers, payments and the audit log"],
    cannot: ["Change anything"],
  },
};

/**
 * How a role is stored. 'sales' cannot go in staff_users.role (see migration
 * 0013), so it is stored as a viewer with the sales flag set: if the flag were
 * ever ignored, the rep would fall back to read-only, never up to operator.
 */
export function storedRole(role: Role): { role: "admin" | "operator" | "viewer"; isSales: 0 | 1 } {
  return role === "sales" ? { role: "viewer", isSales: 1 } : { role, isSales: 0 };
}

export function roleFromStored(role: string, isSales: number | null | undefined): Role {
  if (role === "viewer" && isSales === 1) return "sales";
  return isRole(role) ? role : "viewer";
}
