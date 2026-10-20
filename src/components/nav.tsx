"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/types";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/borrowers", label: "Borrowers" },
  { href: "/payments", label: "Payments" },
  { href: "/audit", label: "Audit" },
  { href: "/staff", label: "Staff", adminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
  { href: "/help", label: "Help" },
];

function Badge({ count }: { count: number }) {
  return (
    <span
      aria-label={`${count} waiting for access`}
      className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white"
    >
      {count}
    </span>
  );
}

/**
 * The top bar. A row of links on a computer; on a phone, where seven links do
 * not fit across, a Menu button that opens them as a list.
 */
export function Nav({
  role,
  roleName,
  email,
  pendingRequests = 0,
}: {
  role: Role;
  roleName: string;
  email: string;
  /** Shown as a badge on Staff so waiting people are noticed without an email. */
  pendingRequests?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close the menu once a link has taken you somewhere. Adjusted during render
  // rather than in an effect, as action-buttons.tsx does for the same reason.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  const links = LINKS.filter((l) => !l.adminOnly || role === "admin");
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold tracking-tight text-slate-900">Excel Capital</span>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(l.href)
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {l.label}
                {l.href === "/staff" && pendingRequests > 0 && <Badge count={pendingRequests} />}
              </Link>
            ))}
          </nav>
        </div>
        <div className="hidden text-right text-xs text-slate-500 md:block">
          <div className="font-medium text-slate-700">{email}</div>
          <div>{roleName}</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 md:hidden"
        >
          <span aria-hidden className="flex flex-col gap-[3px]">
            <span className="block h-[2px] w-4 bg-current" />
            <span className="block h-[2px] w-4 bg-current" />
            <span className="block h-[2px] w-4 bg-current" />
          </span>
          Menu
          {pendingRequests > 0 && !open && <Badge count={pendingRequests} />}
        </button>
      </div>

      {open && (
        <nav id="mobile-menu" className="border-t border-slate-100 pb-3 md:hidden">
          <ul className="py-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`flex items-center rounded-md px-3 py-2.5 text-base font-medium ${
                    isActive(l.href) ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {l.label}
                  {l.href === "/staff" && pendingRequests > 0 && <Badge count={pendingRequests} />}
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 px-3 pt-3 text-xs text-slate-500">
            <div className="font-medium text-slate-700">{email}</div>
            <div>{roleName}</div>
          </div>
        </nav>
      )}
    </div>
  );
}
