"use client";

import { ExternalLink, RefreshCw, Star } from "lucide-react";
import type { Report } from "@/types";
import { latestPeriodic, marketView, metric } from "@/lib/credit-view";

interface CompanyHeaderProps {
  report: Report;
  cached: boolean;
  onWatch: () => void;
  onRefresh: () => void;
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes < 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/** One figure in the identity strip. */
function Figure({ label, value, sub, note, tone }: { label: string; value: string; sub?: string | null; note?: string; tone?: "down" | "up" | null }) {
  return (
    <div className="min-w-0 border-l border-zinc-800 pl-4" title={note}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-[15px] font-medium ${value === "Not available" || value === "Not stated" ? "text-zinc-500" : "text-zinc-50"}`}>{value}</p>
      {sub ? <p className={`truncate font-mono text-[11px] ${tone === "down" ? "text-red-400" : tone === "up" ? "text-emerald-400" : "text-zinc-500"}`}>{sub}</p> : null}
    </div>
  );
}

/**
 * Who the company is and the six numbers a credit desk quotes first, pinned
 * above every tab: equity price and trend (an early warning, and what drives
 * convertibles), size, debt, liquidity and rating.
 */
export function CompanyHeader({ report, cached, onWatch, onRefresh }: CompanyHeaderProps) {
  const company = report.graph.company;
  const market = marketView(report);
  const periodic = latestPeriodic(report);
  const ratings = company.ratings ?? [];
  const debt = metric(report, "total_debt");
  const net = metric(report, "net_debt");
  const liquidity = metric(report, "liquidity");
  const next = metric(report, "next_maturity");

  return (
    <div className="border-b border-zinc-800 px-6 pb-3 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-50">{company.name}</h1>
            <span className="rounded-xs border border-zinc-700 px-1.5 font-mono text-xs text-zinc-300">{company.ticker}</span>
            {company.sic ? <span className="text-xs uppercase tracking-[0.08em] text-zinc-500">{company.sic}</span> : null}
          </div>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            {periodic ? `Latest ${periodic.sourceType}${periodic.fiscalPeriod ? ` (${periodic.fiscalPeriod})` : ""} filed ${periodic.date}` : "No periodic filing"}
            {" · "}
            {report.filingsAnalyzed} filings, {report.newsAnalyzed} headlines read · {cached ? "saved" : "built"} {ago(report.generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onWatch} className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50">
            <Star className="h-3.5 w-3.5" aria-hidden /> Watch for new filings
          </button>
          <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Read the filings again
          </button>
          {periodic ? (
            <a href={periodic.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {periodic.sourceType} on EDGAR
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <Figure
          label="Share price"
          value={market?.price ?? "Not available"}
          sub={market ? `${market.change90d} 90d${market.relative90d ? ` · ${market.relative90d} vs ${market.benchmark}` : ""}` : null}
          tone={report.market ? (report.market.return90d < 0 ? "down" : "up") : null}
          note={market ? `Close on ${market.priceDate}. 52-week range ${market.range52w}.` : undefined}
        />
        <Figure label="Market cap" value={market?.marketCap ?? "Not available"} sub={market ? `52w ${market.range52w}` : null} />
        <Figure label="Total debt" value={debt?.display ?? "Not available"} sub={net ? `Net ${net.display}` : null} note={debt?.note} />
        <Figure label="Liquidity" value={liquidity?.display ?? "Not available"} sub="Cash + revolver" note={liquidity?.note} />
        <Figure label="Next final maturity" value={next?.display ?? "Not available"} note={next?.note} />
        <Figure
          label="Rating"
          value={ratings.length ? ratings.map((r) => `${r.agency} ${r.rating}`).join(" / ") : "Not stated"}
          sub={ratings.length ? (ratings[0].outlook ?? null) : "In filings read"}
          note={ratings.length ? ratings[0].citation.quote : "Ratings are shown only when a filing or headline states them."}
        />
      </div>
    </div>
  );
}
