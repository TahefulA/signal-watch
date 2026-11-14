"use client";

import type { ReactNode } from "react";
import { lookup } from "@/lib/glossary";

/**
 * Shows `text` with a dotted underline and a hover or focus definition when
 * the glossary knows a term in it; plain text otherwise.
 */
export function Term({ text, children }: { text: string; children?: ReactNode }) {
  const entry = lookup(text);
  if (!entry) return <>{children ?? text}</>;
  return (
    <span className="group relative inline-block max-w-full">
      <span tabIndex={0} className="cursor-help underline decoration-zinc-600 decoration-dotted underline-offset-[3px] outline-none focus-visible:decoration-zinc-300">
        {children ?? text}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xs border border-zinc-700 bg-zinc-900 p-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-zinc-200 opacity-0 shadow-lg transition-opacity duration-100 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <span className="font-semibold text-zinc-50">{entry.term}.</span> {entry.text}
      </span>
    </span>
  );
}
