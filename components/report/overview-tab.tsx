"use client";

import { CheckCircle2, FileText, Newspaper, TriangleAlert } from "lucide-react";
import type { Entity, Report, Severity } from "@/types";
import { AskBar } from "@/components/insight/ask-bar";
import { SignalSummary } from "@/components/insight/signal-summary";
import { Card, Stat } from "@/components/ui/section";
import { marketLtv, metric, nearTermMaturities, runway } from "@/lib/credit-view";
import { SEVERITY_DOTS, SEVERITY_HEX, TYPE_HEX, relationText } from "@/lib/node-visuals";
import type { TabKey } from "./report-tabs";

interface OverviewTabProps {
  report: Report;
  onSelectEntity: (entity: Entity) => void;
  onFocusEntity: (id: string) => void;
  onOpenTab: (tab: TabKey) => void;
}

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, none: 3 };

function Dots({ severity }: { severity: Severity }) {
  const color = severity === "none" ? "#a1a1aa" : SEVERITY_HEX[severity];
  return (
    <span className="inline-flex shrink-0 gap-[3px]" aria-label={`${severity} severity`} role="img">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i < SEVERITY_DOTS[severity] ? color : "transparent", border: i < SEVERITY_DOTS[severity] ? "none" : `1px solid ${color}` }} />
      ))}
    </span>
  );
}

function source(e: Entity): string {
  if (e.sourceType === "News") return `${e.sourceLabel} · ${e.sourceDate}`;
  return [e.sourceType, e.fiscalPeriod, e.sourcePage ? `p.${e.sourcePage}` : `filed ${e.sourceDate}`].filter(Boolean).join(" · ");
}

/** One entity as a row: what it is to the company, its figure, and the line it came from. */
function EntityRow({ entity, onSelect }: { entity: Entity; onSelect: (e: Entity) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onSelect(entity)} className="group flex w-full items-start gap-3 py-2.5 text-left">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: TYPE_HEX[entity.type] }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-zinc-100 underline decoration-transparent underline-offset-4 group-hover:decoration-zinc-500">{entity.name}</span>
            <span className="text-xs text-zinc-500">{relationText(entity)}</span>
          </span>
          {entity.headline ? <span className="mt-0.5 block text-xs leading-snug text-zinc-400">{entity.headline}</span> : null}
          <span className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
            {entity.sourceType === "News" ? <Newspaper className="h-3 w-3" aria-hidden /> : <FileText className="h-3 w-3" aria-hidden />}
            {source(entity)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <Dots severity={entity.severity} />
          {entity.magnitude ? <span className="max-w-[12rem] text-right font-mono text-xs leading-snug text-zinc-200">{entity.magnitude.label}</span> : null}
        </span>
      </button>
    </li>
  );
}

/**
 * The two-minute read before a portfolio manager asks about the name: the
 * story, the numbers that decide the credit, what the company depends on,
 * what could go wrong, what changed, and how much of it was verified.
 */
export function OverviewTab({ report, onSelectEntity, onFocusEntity, onOpenTab }: OverviewTabProps) {
  const nodes = report.graph.nodes.filter((n) => !n.isCentral && n.change?.kind !== "removed");
  const bySeverity = (a: Entity, b: Entity) => RANK[a.severity] - RANK[b.severity];
  const counterparties = nodes.filter((n) => n.type === "company").sort(bySeverity).slice(0, 7);
  const risks = nodes.filter((n) => n.type === "risk" || n.type === "regulatory" || n.type === "macro").sort(bySeverity).slice(0, 7);
  const facts = report.changes?.changes.filter((c) => !c.judgment) ?? [];
  const v = report.validation;

  const ebitda = metric(report, "ebitda");
  const margin = metric(report, "ebitda_margin");
  const derived = [runway(report), marketLtv(report), nearTermMaturities(report)];
  const tiles: { label: string; key: Parameters<typeof metric>[1]; sub?: string | null }[] = [
    { label: "Revenue, last 12 months", key: "revenue" },
    { label: "EBITDA, last 12 months", key: "ebitda", sub: margin ? `Margin ${margin.display}` : null },
    { label: "Free cash flow, last 12 months", key: "fcf" },
    { label: "Total debt / EBITDA", key: "debt_to_ebitda", sub: ebitda && ebitda.display.startsWith("-") ? "EBITDA negative" : null },
    { label: "EBITDA / interest", key: "interest_coverage" },
    { label: "Current ratio", key: "current_ratio" },
  ];

  return (
    <div className="space-y-5">
      {report.signal?.length ? <SignalSummary spans={report.signal} onEntityClick={onFocusEntity} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => {
          const m = metric(report, t.key);
          const value = m?.display ?? "Not available";
          const ratio = /^-?\d+(\.\d+)?x$/.test(value) ? Number(value.slice(0, -1)) : null;
          const tone =
            t.key === "current_ratio" && ratio !== null ? (ratio < 1 ? "stress" : ratio < 1.5 ? "watch" : "neutral") :
            t.key === "fcf" || t.key === "ebitda" ? (value.startsWith("-") ? "stress" : "neutral") :
            "neutral";
          return <Stat key={t.key} label={t.label} value={value.replace(" million", "M").replace(" billion", "B")} sub={t.sub ?? null} note={m?.note} tone={tone} muted={value === "Not available" || value === "n/m"} />;
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {derived.map((d, i) =>
          d ? (
            <Stat key={d.label} label={d.label} value={d.display} sub={d.why} note={d.note} tone={d.tone} wrap />
          ) : (
            <Stat key={i} label={["Liquidity runway", "Market loan-to-value", "Near-term maturities"][i]} value="Not available" muted wrap sub={["Only for companies burning cash", "Needs net debt and a market cap", "Needs the filing's maturities table"][i]} />
          ),
        )}
      </div>
      <Card title="Ask this report" why="Answers come only from this report's quotes and figures, with the sources as chips.">
        <AskBar reportId={report.id} nodes={report.graph.nodes} onEntityClick={onFocusEntity} onCapitalClick={() => onOpenTab("financials")} />
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="Who the cash flows depend on"
          why="Customers, suppliers, guarantors and partners named in the filings, most severe first."
          actions={
            <button type="button" onClick={() => onOpenTab("map")} className="text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
              All {nodes.length} on the map
            </button>
          }
        >
          {counterparties.length ? (
            <ul className="-my-2.5 divide-y divide-zinc-800">
              {counterparties.map((e) => (
                <EntityRow key={e.id} entity={e} onSelect={onSelectEntity} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No counterparty was verified in the filings read.</p>
          )}
        </Card>

        <Card title="What could go wrong" why="Specific risks, regulators and macro exposures from the filings, most severe first.">
          {risks.length ? (
            <ul className="-my-2.5 divide-y divide-zinc-800">
              {risks.map((e) => (
                <EntityRow key={e.id} entity={e} onSelect={onSelectEntity} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No risk was verified in the filings read.</p>
          )}
        </Card>

        <Card
          title="What changed since last quarter"
          why="New or dropped counterparties, regulators and debt in the newest filings."
          actions={
            <button type="button" onClick={() => onOpenTab("changes")} className="text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
              {report.changes ? "Full comparison" : "Run the comparison"}
            </button>
          }
        >
          {!report.changes ? (
            <p className="text-sm text-zinc-400">Not compared yet. The comparison rebuilds the map from the previous quarter&rsquo;s filings and lists what is new.</p>
          ) : facts.length === 0 ? (
            <p className="text-sm text-zinc-400">The newer filings add or remove no entity on the map.</p>
          ) : (
            <ul className="space-y-2.5">
              {facts.slice(0, 6).map((c) => (
                <li key={`${c.kind}-${c.name}`} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.kind === "new" || c.kind === "new_debt" ? "bg-emerald-600" : c.kind === "removed" || c.kind === "repaid_debt" ? "bg-zinc-500" : "bg-amber-600"}`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    {c.entityId ? (
                      <button type="button" onClick={() => onFocusEntity(c.entityId as string)} className="font-medium text-zinc-100 underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-400">
                        {c.name}
                      </button>
                    ) : (
                      <span className="font-medium text-zinc-100">{c.name}</span>
                    )}{" "}
                    <span className="text-zinc-400">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="How much to trust it"
          why="Every box's quote was searched for in the document it cites."
          actions={
            <button type="button" onClick={() => onOpenTab("sources")} className="text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
              Audit trail
            </button>
          }
        >
          {v ? (
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-sm text-zinc-200">
                {v.rejected.length ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />}
                <span>
                  {v.kept} of {v.proposed} entities Gemini proposed were verified against the source text
                  {v.rejected.length ? `; ${v.rejected.length} rejected` : ""}
                  {v.merges.length ? `; ${v.merges.length} merged as duplicates` : ""}
                  {v.debtAdded ? `; ${v.debtAdded} debt instruments added from the debt note` : ""}.
                </span>
              </p>
              <div className="grid grid-cols-3 gap-3">
                {(["high", "medium", "low"] as const).map((c) => (
                  <Stat key={c} label={`${c.charAt(0).toUpperCase()}${c.slice(1)} confidence`} value={String(nodes.filter((n) => n.confidence === c).length)} sub={c === "high" ? "Stated, names it" : c === "medium" ? "Inferred or headline" : "Headline inference"} />
                ))}
              </div>
              {v.rejected.length ? (
                <p className="text-xs text-zinc-500">
                  Rejected: {v.rejected.map((r) => r.name).join(", ")}. Reasons are in the audit trail.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">This report predates the validation record.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
