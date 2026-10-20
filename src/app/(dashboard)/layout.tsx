import { headers } from "next/headers";
import { ROLE_INFO } from "@/lib/roles";
import { getCurrentUser } from "@/lib/auth";
import { getAuthenticatedEmail } from "@/lib/access";
import { getDb, getEnv } from "@/lib/db";
import { getRequestByEmail, pendingRequestCount } from "@/lib/repo/access-requests";
import { RequestAccess } from "@/components/request-access";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    // Authenticated by Cloudflare but not staff. Offer to ask for access rather
    // than showing a dead end. Not signed in at all still gets nothing.
    const env = getEnv();
    const email = await getAuthenticatedEmail(await headers(), env);
    if (!email) {
      return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-xl font-semibold">Not signed in</h1>
          <p className="text-sm text-slate-600">Sign in again to continue.</p>
        </main>
      );
    }
    const existing = await getRequestByEmail(getDb(), email);
    return (
      <RequestAccess
        email={email}
        alreadyRequested={existing?.status === "pending"}
        denied={existing?.status === "denied"}
      />
    );
  }

  // Only admins can act on requests, so only they need the badge.
  const pendingRequests =
    user.role === "admin" ? await pendingRequestCount(getDb()) : 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <Nav
          role={user.role}
          roleName={ROLE_INFO[user.role].name}
          email={user.email}
          pendingRequests={pendingRequests}
        />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
