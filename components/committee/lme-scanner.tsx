"use client";

import { Check, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { LmeScan, Report, TrapdoorRisk } from "@/types";
import { TRAPDOOR_LABELS, TRAPDOOR_MOVES } from "@/lib/lme-labels";

const RISK: Record<TrapdoorRisk, { label: string; tone: string; border: string }> = {
  high: { label: "Door open", tone: "text-red-500", border: "border-red-600" },
  medium: { label: "Open, partly blocked", tone: "text-amber-500", border: "border-amber-600" },
  low: { label: "Blocked", tone: "text-emerald-500", border: "border-emerald-600" },
  not_found: { label: "Not found", tone: "text-zinc-400", border: "border-zinc-700" },
};

/**
 * Liability-management trapdoors: the borrower's own indentures and credit
 * agreements, read for the clauses that let it move assets, release guarantors
 * or prime some lenders. Every clause shown was found word for word in the
 * document; the risk is decided by code from those clauses.
 */
export function LmeScanner({ report, initial }: { report: Report; initial?: LmeScan | null }) {
  const [scan, setScan] = useState<LmeScan | null | undefined>(initial !== undefined ? initial : report.lme);
  const [error, setError] = useState<string | null>(null);
  const [showStruck, setShowStruck] = useState(false);

  useEffect(() => {
    if (scan !== undefined) return;
    let live = true;
    fetch("/api/lme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: report.id }) })
      .then(async (r) => {
        const body = (await r.json()) as { lme?: LmeScan | null; error?: string };
        if (!live) return;
        if (r.ok) setScan(body.lme ?? null);
        else setError(body.error ?? "The credit documents could not be read.");
      })
      .catch(() => live && setError("The credit documents could not be read."));
    return () => {
      live = false;
    };
  }, [report.id, scan]);

  const shown = scan ? scan.clauses.filter((c) => c.verified || showStruck) : [];

  return (
    <section className="mt-8" data-tour="trapdoors">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> Credit documents: trapdoor check
      </h3>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-zinc-400">
        The borrower&rsquo;s own indentures and credit agreements from EDGAR, read for the clauses behind the J.Crew, Chewy and Serta deals, where some
        creditors were left behind. Gemini reads the clauses; code keeps a clause only if its quote is in the document, and decides the label.
      </p>

      {scan === undefined && !error ? <p className="mt-3 text-sm text-zinc-500">Reading the credit documents&hellip;</p> : null}
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      {scan === null ? <p className="mt-3 text-sm text-zinc-500">No indenture or credit agreement for this company was found on EDGAR in the last six years.</p> : null}

      {scan ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {scan.verdicts.map((v) => (
              <div key={v.trapdoor} className={`surface rounded-xs border border-l-[3px] border-zinc-800 ${RISK[v.risk].border} p-3`}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{TRAPDOOR_LABELS[v.trapdoor]}</span>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${RISK[v.risk].tone}`}>{RISK[v.risk].label}</span>
                </p>
                <p className="mt-1 text-xs leading-snug text-zinc-400">{TRAPDOOR_MOVES[v.trapdoor]}.</p>
                <p className="mt-2 text-[11px] text-zinc-500">{v.basis}</p>
              </div>
            ))}
          </div>

          <ul className="mt-4 space-y-3">
            {shown.map((c, i) => (
              <li key={`${c.trapdoor}-${i}`} className={`border-l-[3px] bg-zinc-900/60 px-4 py-3 ${c.status === "door_open" ? "border-red-600" : "border-emerald-600"}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-200">{TRAPDOOR_LABELS[c.trapdoor]}</span>
                  <span className={`text-[11px] ${c.status === "door_open" ? "text-red-500" : "text-emerald-500"}`}>{c.status === "door_open" ? "opens the door" : "blocks it"}</span>
                  {c.section ? <span className="text-[11px] text-zinc-500">{c.section}</span> : null}
                  <span className="ml-auto">
                    {c.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-xs border border-emerald-700/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-500">
                        <Check className="h-3 w-3" aria-hidden /> Quote found
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-xs border border-red-700/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-500">
                        <X className="h-3 w-3" aria-hidden /> Struck: not in the document
                      </span>
                    )}
                  </span>
                </div>
                <blockquote className={`mt-1.5 text-[13px] italic leading-relaxed ${c.verified ? "text-zinc-200" : "text-zinc-500 line-through decoration-red-600/70"}`}>&ldquo;{c.quote ?? c.claimed}&rdquo;</blockquote>
                <p className="mt-1 text-xs text-zinc-400">{c.why}</p>
                <a href={c.documentUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200">
                  {scan.documents.find((d) => d.url === c.documentUrl)?.title ?? "Document"} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
                {c.alsoIn?.length ? <span className="ml-2 text-[11px] text-zinc-500">Same clause in {c.alsoIn.map((u) => scan.documents.find((d) => d.url === u)?.title ?? "another document").join(", ")}</span> : null}
              </li>
            ))}
          </ul>
          {!scan.clauses.some((c) => c.verified) ? <p className="mt-3 text-sm text-zinc-500">No clause on these trapdoors was found in the passages read.</p> : null}

          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Read {scan.documents.map((d) => `${d.title} (${d.exhibit}, filed ${d.filed})`).join("; ")}. {scan.struck ? `${scan.struck} clause${scan.struck === 1 ? "" : "s"} struck because the quote was not in the document. ` : ""}
            {scan.offTopic ? `${scan.offTopic} dropped because the clause did not use the trapdoor's terms. ` : ""}
            {scan.struck ? (
              <button type="button" onClick={() => setShowStruck((s) => !s)} className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200">
                {showStruck ? "Hide" : "Show"} struck
              </button>
            ) : null}{" "}
            A screen of the passages that name these terms, not a legal opinion: amendments filed later can change any of it.
          </p>
        </>
      ) : null}
    </section>
  );
}
