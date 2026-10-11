"use client";

import { Presentation, ShieldAlert, Star } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { TAGLINE } from "./tab-bar";
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
  /** The memo's stance and the Devil's Advocate's concerns, once there is a report. */
  verdict?: ReactNode;
  /** The wordmark returns to the home screen. */
  onHome?: () => void;
  /** Watch button for the open report. */
  watch?: { ticker: string; watched: boolean; onToggle: () => void } | null;
  /** Watched companies in Act now or Review, shown beside the Watchlist link. */
  attention?: number;
  /** Starts the presentation tour. */
  onTour?: () => void;
}

/** 48px header: wordmark, ticker search, changes badge, command palette hint. */
export function TopBar({ busy, changes, onAnalyze, onOpenChanges, onOpenPalette, hasReport, verdict = null, onHome, watch = null, attention = 0, onTour }: TopBarProps) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker || busy) return;
    onAnalyze(ticker);
    // Clear the box so the next ticker can be typed straight in.
    setValue("");
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-4 print:hidden">
      <Link
        href="/"
        onClick={(event) => {
          if (!onHome || event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          onHome();
        }}
        className="flex shrink-0 items-center gap-2"
        title="Home"
      >
        <ShieldAlert className="h-[18px] w-[18px] text-red-600" aria-hidden />
        <span className="hidden flex-col leading-none sm:flex">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-50">Signal Watch</span>
          <span className="mt-1 hidden text-[10px] text-zinc-500 lg:block">{TAGLINE}</span>
        </span>
      </Link>

      <form onSubmit={submit} role="search" className="flex min-w-0 items-center gap-2 sm:ml-4">
        <label htmlFor="ticker" className="sr-only">
          Ticker symbol
        </label>
        <input
          id="ticker"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^A-Za-z0-9.\-]/g, ""))}
          onFocus={(e) => e.target.select()}
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
        {verdict}
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
        {watch ? (
          <button
            type="button"
            onClick={watch.onToggle}
            aria-pressed={watch.watched}
            className={`inline-flex items-center gap-1.5 rounded-xs border px-2 py-1 text-[11px] font-medium transition-colors duration-100 ${
              watch.watched ? "border-amber-600 text-amber-500 hover:bg-zinc-900" : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
            }`}
            title={watch.watched ? `${watch.ticker} is on your watchlist; click to stop watching` : `Add ${watch.ticker} to your watchlist`}
          >
            <Star className="h-3 w-3" fill={watch.watched ? "currentColor" : "none"} aria-hidden />
            {watch.watched ? "Watching" : "Watch"}
          </button>
        ) : null}
        {onTour ? (
          <button
            type="button"
            onClick={onTour}
            className="hidden items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 md:inline-flex"
            title="Presentation tour: what each part is and why it is there"
          >
            <Presentation className="h-3.5 w-3.5" aria-hidden /> Tour
          </button>
        ) : null}
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100" title="Your watchlist: which companies need you today">
          Watchlist
          {attention > 0 ? (
            <span className="rounded-xs bg-red-600 px-1.5 py-px font-mono text-[10px] font-semibold text-white" aria-label={`${attention} need attention`}>
              {attention}
            </span>
          ) : null}
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
