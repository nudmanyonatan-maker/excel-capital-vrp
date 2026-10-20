"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export interface ParamOption {
  value: string;
  label: string;
}

/**
 * A dropdown that changes one setting in the page's address and reloads it.
 *
 * Kept in the URL rather than in component state so a view can be bookmarked or
 * sent to someone ("this is September"), and so the page itself stays a server
 * component that reads its data once.
 */
export function ParamSelect({
  name,
  value,
  label,
  options,
  groups,
}: {
  name: string;
  value: string;
  label: string;
  options?: ParamOption[];
  /** Options shown under headings, for longer lists such as past months. */
  groups?: { label: string; options: ParamOption[] }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set(name, e.target.value);
          startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
        className="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-slate-900 disabled:opacity-60"
      >
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {groups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
