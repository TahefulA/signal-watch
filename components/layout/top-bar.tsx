"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ThemeToggle } from "./theme-toggle";

interface TopBarProps {
  busy: boolean;
  /** Fact changes since the previous quarter; the badge shows only when above zero. */
  changes: number;
  onAnalyze: (ticker: string) => void;
  onOpenChanges: () => void;
  onOpenPalette: () => void;
  /** Hides the palette hint until there is a report to ask about. */
  hasReport: boolean;
}

/** 48px header: wordmark, ticker search, changes badge, command palette hint. */
export function TopBar({ busy, changes, onAnalyze, onOpenChanges, onOpenPalette, hasReport }: TopBarProps) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (ticker && !busy) onAnalyze(ticker);
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-4 print:hidden">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <ShieldAlert className="h-[18px] w-[18px] text-red-600" aria-hidden />
        <span className="hidden text-xs font-semibold uppercase tracking-wider text-zinc-50 sm:inline">Signal Watch</span>
      </Link>

      <form onSubmit={submit} role="search" className="flex min-w-0 items-center gap-2 sm:ml-4">
        <label htmlFor="ticker" className="sr-only">
          Ticker symbol
        </label>
        <input
          id="ticker"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^A-Za-z0-9.\-]/g, ""))}
          placeholder="Enter ticker"
          autoComplete="off"
          spellCheck={false}
          maxLength={10}
          className="h-8 w-28 min-w-0 rounded-xs border border-zinc-800 bg-zinc-900 px-3 font-mono text-[13px] uppercase text-zinc-50 placeholder:font-sans placeholder:normal-case placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none sm:w-[200px]"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="h-8 shrink-0 rounded-xs bg-zinc-50 px-4 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 active:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {busy ? "Analyzing" : "Analyze"}
        </button>
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {changes > 0 ? (
          <button
            type="button"
            onClick={onOpenChanges}
            className="inline-flex items-center gap-1.5 rounded-xs border border-red-600 bg-red-50 px-2 py-1 font-mono text-[11px] font-semibold text-red-700"
            title={`${changes} change${changes === 1 ? "" : "s"} since the previous quarter`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />
            {changes}
          </button>
        ) : null}
        {hasReport ? (
          <button
            type="button"
            onClick={onOpenPalette}
            className="hidden rounded-xs border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-400 hover:text-zinc-100 sm:inline-flex"
            title="Ask a question about this company"
          >
            ⌘K
          </button>
        ) : null}
        <Link href="/dashboard" className="text-xs text-zinc-400 hover:text-zinc-100">
          Dashboard
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
