"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { BriefItem, MeetingBrief, Report } from "@/types";
import { Button } from "@/components/ui/button";
import { BriefView } from "./brief-view";

interface MeetingPrepPanelProps {
  report: Report;
  busy: boolean;
  error: string | null;
  hasPeers: boolean;
  onPrepare: () => void;
}

/** The documents and pages the brief cites, so they can be opened before the meeting. */
function EvidenceIndex({ brief }: { brief: MeetingBrief }) {
  const citations = [...brief.mustKnow, ...brief.questions].flatMap((i) => i.citations).concat(brief.risks.map((r) => r.citation));
  const byDoc = new Map<string, { label: string; url: string; pages: Set<string>; count: number }>();
  for (const c of citations) {
    const label = c.sourceType === "News" ? `${c.sourceLabel}, ${c.sourceDate}` : `${c.sourceType} filed ${c.sourceDate}`;
    const entry = byDoc.get(c.sourceUrl) ?? { label, url: c.sourceUrl, pages: new Set<string>(), count: 0 };
    entry.count += 1;
    if (c.page) entry.pages.add(c.page);
    byDoc.set(c.sourceUrl, entry);
  }
  const docs = Array.from(byDoc.values()).sort((a, b) => b.count - a.count);
  return (
    <aside aria-label="Pages to have open" className="rounded-xs border border-zinc-800 bg-zinc-900/60 xl:sticky xl:top-16">
      <h3 className="border-b border-zinc-800 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300">Pages to have open</h3>
      <p className="px-5 pt-3 text-xs text-zinc-500">Every filing and page the brief cites, most cited first, so the source is at hand when management answers.</p>
      <ul className="divide-y divide-zinc-800 px-5 py-2">
        {docs.map((d) => (
          <li key={d.url} className="flex items-start justify-between gap-3 py-3">
            <span className="min-w-0">
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-zinc-100 underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-400">
                {d.label}
                <ExternalLink className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
              </a>
              {d.pages.size ? (
                <span className="mt-0.5 block font-mono text-[11px] text-zinc-500">
                  p. {Array.from(d.pages).sort((a, b) => Number(a) - Number(b)).join(", ")}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 font-mono text-xs text-zinc-400">
              {d.count} line{d.count === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

const plain = (item: BriefItem) => item.spans.map((s) => s.text).join("");

/** The brief as plain text, to paste into meeting notes, an email or a chat. */
function briefText(brief: MeetingBrief, report: Report): string {
  const c = report.graph.company;
  const lines = [
    `${c.name} (${c.ticker}) - meeting brief, ${brief.generatedAt.slice(0, 10)}`,
    "",
    "THREE THINGS TO KNOW",
    ...brief.mustKnow.map((m, i) => `${i + 1}. ${plain(m)}`),
    "",
    "THE NUMBERS",
    ...brief.numbers.map((n) => `- ${n.label}: ${n.display}`),
    "",
    "RISKS TO WATCH",
    ...brief.risks.map((r) => `- ${r.name} (${r.severity}): "${r.citation.quote}" [${r.citation.sourceType} ${r.citation.sourceDate}${r.citation.page ? `, p. ${r.citation.page}` : ""}]`),
    "",
    "QUESTIONS TO ASK",
    ...brief.questions.map((q, i) => `${i + 1}. ${plain(q)}`),
  ];
  if (brief.comparables) {
    lines.push("", `COMPARABLES (${brief.comparables.tickers.join(" vs ")})`);
    for (const row of brief.comparables.rows) lines.push(`- ${row.label}: ${row.values.map((v) => `${v.ticker} ${v.display}`).join(", ")}`);
  }
  lines.push("", `Source: Signal Watch report ${report.id}, built from SEC filings and news. Every figure is from the filings or XBRL data.`);
  return lines.join("\n");
}

/** Below the memo: generates the one-page meeting brief and links to its printable page. */
export function MeetingPrepPanel({ report, busy, error, hasPeers, onPrepare }: MeetingPrepPanelProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!report.brief) return;
    try {
      await navigator.clipboard.writeText(briefText(report.brief, report));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section aria-labelledby="prep-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="prep-title" className="font-display text-xl font-bold tracking-tight text-zinc-50">
            Meeting prep
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            A one-page brief: three things to know, the numbers, questions to ask, risks to watch{hasPeers ? " and the loaded peers" : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          {report.brief ? (
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-2 rounded-sm border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
            >
              <Copy className="h-4 w-4 text-zinc-500" aria-hidden />
              {copied ? "Copied" : "Copy as text"}
            </button>
          ) : null}
          {report.brief ? (
            <a
              href={`/brief/${report.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-sm border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
            >
              <ExternalLink className="h-4 w-4 text-zinc-500" aria-hidden />
              Printable page
            </a>
          ) : null}
          <Button onClick={onPrepare} disabled={busy} variant={report.brief ? "secondary" : "primary"}>
            {busy ? "Preparing..." : report.brief ? "Prepare again" : "Prepare meeting brief"}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {report.brief ? (
        <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,56rem)_minmax(0,1fr)]">
          <div className="rounded-xs border border-zinc-800 bg-zinc-900 p-6">
            <BriefView brief={report.brief} report={report} />
          </div>
          <EvidenceIndex brief={report.brief} />
        </div>
      ) : null}
    </section>
  );
}
