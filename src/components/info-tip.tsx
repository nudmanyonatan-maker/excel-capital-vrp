"use client";

import { useId, useState } from "react";

/**
 * A small "i" that explains a field when hovered, focused or tapped.
 *
 * Excel Capital asked for this so nobody has to ask how something works: every
 * field carries its own explanation, written in TIPS (lib/help-text.ts). Works
 * on a phone too, where there is no hover: a tap toggles it.
 */
export function InfoTip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label="What is this?"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          // Inside a <label>, so stop the click focusing the field instead.
          e.preventDefault();
          setOpen((o) => !o);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-400 text-[10px] font-semibold leading-none text-slate-500 hover:border-slate-700 hover:text-slate-800"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-5 z-30 w-64 max-w-[80vw] rounded-md bg-slate-900 px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
