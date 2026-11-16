"use client";

import { FeedbackButton } from "@/components/feedback/feedback-button";
import { downloadText, reportCsv } from "@/lib/export";
import Link from "next/link";
import { ChevronDown, MessageCircleQuestion, MoreHorizontal, RefreshCw, Star } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { DistressBand, Report } from "@/types";

const BAND: Record<DistressBand, { label: string; cls: string }> = {
  low: { label: "Low risk", cls: "border-emerald-700/70 text-emerald-400" },
  elevated: { label: "Elevated risk", cls: "border-amber-600/70 text-amber-400" },
  high: { label: "High risk", cls: "border-red-600/80 text-red-400" },
  severe: { label: "Severe risk", cls: "border-red-500 bg-red-950/40 text-red-300" },
};

interface CompanyHeaderProps {
  report: Report;
  /** True when the report was loaded from storage rather than built just now. */
  cached: boolean;
  watched: boolean;
  onToggleWatch: () => void;
  onAsk: () => void;
  onRefresh: () => void;
  onTour: () => void;
  /** The memo's stance and the Devil's Advocate's concern count; opens the Memo tab. */
  memo: { verdict: string | null; concerns: number; busy: boolean; onOpen: () => void };
}

/** Closes a popover on an outside click. */
function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return ref;
}

/** The company's name and standing, where its data came from, and what can be done with the report. */
export function CompanyHeader({ report, cached, watched, onToggleWatch, onAsk, onRefresh, onTour, memo }: CompanyHeaderProps) {
  const [checksOpen, setChecksOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const checksRef = useOutside(checksOpen, () => setChecksOpen(false));
  const moreRef = useOutside(moreOpen, () => setMoreOpen(false));
  const { company } = report.graph;
  const band = report.distress ? BAND[report.distress.band] : null;
  const v = report.validation;
  const rejected = v?.rejected.length ?? 0;
  const sources = `SEC filings${report.newsAnalyzed ? ", news" : ""} and market prices`;

  const action = (label: ReactNode, onClick: () => void, title?: string) => (
    <button type="button" onClick={onClick} title={title} className="inline-flex h-8 items-center gap-1.5 rounded-xs border border-zinc-800 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:text-zinc-50">
      {label}
    </button>
  );

  return (
    <section className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-6 print:hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tracking-tight text-zinc-50">
            <span className="truncate">{company.name}</span>
            <span className="font-mono text-[13px] font-medium text-zinc-500">{company.ticker}</span>
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            From {sources} · checked {report.generatedAt.slice(0, 10)} ·{" "}
            <Link href="/terms" className="hover:text-zinc-300">
              not investment advice
            </Link>
            {v ? (
              <span ref={checksRef} className="relative">
                {" · "}
                <button type="button" onClick={() => rejected && setChecksOpen((o) => !o)} className={rejected ? "underline decoration-dotted underline-offset-2 hover:text-zinc-300" : "cursor-default"}>
                  {v.kept} of {v.proposed} names confirmed in the filings
                </button>
                {checksOpen ? (
                  <span className="absolute left-0 top-6 z-50 block w-[min(420px,calc(100vw-2rem))] rounded-xs border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300 shadow-lg">
                    <span className="mb-2 block text-[11px] font-semibold text-zinc-500">Left out because the filings did not support them</span>
                    {v.rejected.map((r) => (
                      <span key={`${r.name}-${r.reason}`} className="mb-1.5 block">
                        <span className="text-zinc-100">{r.name}</span>: {r.reason}
                      </span>
                    ))}
                    {v.merges.length ? <span className="mt-2 block text-zinc-500">Merged: {v.merges.map((m) => `${m.merged} into ${m.kept}`).join("; ")}.</span> : null}
                  </span>
                ) : null}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {band ? <span className={`rounded-xs border px-2 py-1 text-xs font-semibold ${band.cls}`}>{band.label}</span> : null}
          <button
            type="button"
            onClick={memo.onOpen}
            className="hidden rounded-xs border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-100 md:inline-block"
            title="The memo's stance, and the sourced concerns the Devil's Advocate raised against it"
          >
            {memo.busy && !memo.verdict ? (
              "Arguing the other side…"
            ) : (
              <>
                Memo: <span className="text-zinc-200">{memo.verdict ?? "not classified"}</span> · <span className="text-red-400">{memo.concerns} concern{memo.concerns === 1 ? "" : "s"}</span>
              </>
            )}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleWatch}
            aria-pressed={watched}
            className={`inline-flex h-8 items-center gap-1.5 rounded-xs border px-3 text-xs font-medium ${
              watched ? "border-amber-600/80 text-amber-400 hover:bg-zinc-900" : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-zinc-50"
            }`}
            title={watched ? "On your watchlist; click to stop watching" : "Add to your watchlist"}
          >
            <Star className="h-3.5 w-3.5" fill={watched ? "currentColor" : "none"} aria-hidden />
            {watched ? "Watching" : "Watch"}
          </button>
          <span className="max-sm:hidden">
            {action(
              <>
                <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden /> Ask <kbd className="font-mono text-[11px] text-zinc-500">⌘K</kbd>
              </>,
              onAsk,
              "Ask a question about this company",
            )}
          </span>
          <div ref={moreRef} className="relative">
            {action(
              <>
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                <span className="max-sm:sr-only">More</span>
                <ChevronDown className="h-3 w-3 max-sm:hidden" aria-hidden />
              </>,
              () => setMoreOpen((o) => !o),
            )}
            {moreOpen ? (
              <div className="absolute right-0 top-9 z-50 flex w-52 flex-col rounded-xs border border-zinc-800 bg-zinc-900 py-1 text-left text-xs text-zinc-300 shadow-lg" onClick={() => setMoreOpen(false)}>
                <MenuItem onClick={onRefresh} title={cached ? "This is a saved report; read the latest filings again" : undefined}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Read the filings again
                </MenuItem>
                <MenuItem onClick={() => downloadText(`${company.ticker}-signal-watch-${report.generatedAt.slice(0, 10)}.csv`, reportCsv(report))}>Export CSV</MenuItem>
                <MenuItem onClick={() => window.print()}>Print or save as PDF</MenuItem>
                <MenuItem onClick={onAsk} className="sm:hidden">
                  Ask a question
                </MenuItem>
                <MenuItem onClick={onTour}>Guided tour</MenuItem>
                <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <FeedbackButton className="text-zinc-300" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function MenuItem({ children, onClick, title, className = "" }: { children: ReactNode; onClick: () => void; title?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} className={`flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 hover:text-zinc-50 ${className}`}>
      {children}
    </button>
  );
}
