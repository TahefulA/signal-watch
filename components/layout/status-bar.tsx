"use client";

import { FeedbackButton } from "@/components/feedback/feedback-button";
import { downloadText, reportCsv } from "@/lib/export";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Report } from "@/types";

/** 32px footer: verification, counts, when the report was built and from what. */
interface StatusBarProps {
  report: Report;
  /** True when the report was loaded from storage rather than built just now. */
  cached: boolean;
  onWatch: () => void;
  onRefresh: () => void;
}

export function StatusBar({ report, cached, onWatch, onRefresh }: StatusBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const v = report.validation;
  const rejected = v?.rejected.length ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const dot = <span className="text-zinc-600">·</span>;
  return (
    <footer className="flex h-8 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-t border-zinc-800 bg-zinc-950 px-4 font-mono text-xs text-zinc-400 print:hidden">
      {v ? (
        <div ref={ref} className="relative">
          <button type="button" onClick={() => rejected && setOpen((o) => !o)} className={`inline-flex items-center gap-1.5 ${rejected ? "hover:text-zinc-100" : "cursor-default"}`}>
            {rejected ? <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden /> : <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden />}
            {v.kept}/{v.proposed} verified{rejected ? ` · ${rejected} rejected` : ""}
          </button>
          {open ? (
            <div className="fixed bottom-9 left-4 z-50 w-[min(420px,calc(100vw-2rem))] whitespace-normal rounded-xs border border-zinc-800 bg-zinc-900 p-3 font-sans text-xs text-zinc-300">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Rejected entities</p>
              <ul className="space-y-2">
                {v.rejected.map((r) => (
                  <li key={`${r.name}-${r.reason}`}>
                    <span className="text-zinc-100">{r.name}</span>: {r.reason}
                  </li>
                ))}
              </ul>
              {v.merges.length ? (
                <p className="mt-2 text-zinc-500">
                  Merged: {v.merges.map((m) => `${m.merged} into ${m.kept}`).join("; ")}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {v ? dot : null}
      <span className="text-zinc-600">{report.generatedAt.slice(11, 16)} UTC {report.generatedAt.slice(0, 10)}</span>
      {dot}
      <span className="text-zinc-600">Source: SEC EDGAR{report.newsAnalyzed ? ", Google News" : ""}, Yahoo Finance</span>
      <span className="ml-auto flex items-center gap-3 pl-4 font-sans">
        <FeedbackButton className="text-zinc-400" />
        <button
          type="button"
          onClick={() => downloadText(`${report.graph.company.ticker}-signal-watch-${report.generatedAt.slice(0, 10)}.csv`, reportCsv(report))}
          className="hidden text-zinc-400 hover:text-zinc-100 sm:inline"
          title="The forecast, credit metrics, debt instruments and maturities, with sources"
        >
          Export CSV
        </button>
        <button type="button" onClick={() => window.print()} className="hidden text-zinc-400 hover:text-zinc-100 sm:inline" title="Print this tab, or save it as a PDF">
          Print / PDF
        </button>
        <button type="button" onClick={onWatch} className="hidden text-zinc-400 hover:text-zinc-100 sm:inline">
          Add to watchlist
        </button>
        <button type="button" onClick={onRefresh} className="text-zinc-400 hover:text-zinc-100" title={cached ? "This is a saved report" : undefined}>
          Read the filings again
        </button>
      </span>
    </footer>
  );
}
