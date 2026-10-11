"use client";

import { ArrowDownUp, Download } from "lucide-react";
import { useMemo, useState } from "react";
import type { Entity, Report, Severity } from "@/types";
import { TYPE_LABELS } from "@/lib/entity-style";
import { SEVERITY_DOTS, SEVERITY_HEX, TYPE_HEX, relationText } from "@/lib/node-visuals";

type SortKey = "severity" | "type" | "name" | "confidence" | "source";

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, none: 3 };
const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 } as const;

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Every entity with its relationship, figure, quote and source, as a CSV for a model or a credit file. */
function toCsv(report: Report, rows: Entity[]): string {
  const header = ["Company", "Entity", "Type", "Relationship", "Severity", "Confidence", "Figure", "Change", "Source", "Fiscal period", "Page", "Filed or published", "Quote", "URL"];
  const lines = rows.map((e) =>
    [
      report.graph.company.ticker,
      e.name,
      TYPE_LABELS[e.type],
      relationText(e),
      e.severity,
      e.confidence ?? "",
      e.magnitude?.label ?? "",
      e.change?.kind ?? "",
      e.sourceType === "News" ? e.sourceLabel : e.sourceType,
      e.fiscalPeriod ?? "",
      e.sourcePage ?? "",
      e.sourceDate,
      e.sourceQuote,
      e.sourceUrl,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function download(report: Report, rows: Entity[]) {
  const blob = new Blob([toCsv(report, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.graph.company.ticker}-entities-${report.generatedAt.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** The map as a sortable table: the same entities, in the grid analysts work in. */
export function EntityTable({ report, onSelect }: { report: Report; onSelect: (e: Entity) => void }) {
  const [sort, setSort] = useState<SortKey>("severity");
  const rows = useMemo(() => {
    const list = report.graph.nodes.filter((n) => !n.isCentral);
    const by: Record<SortKey, (a: Entity, b: Entity) => number> = {
      severity: (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.name.localeCompare(b.name),
      type: (a, b) => a.type.localeCompare(b.type) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
      name: (a, b) => a.name.localeCompare(b.name),
      confidence: (a, b) => CONFIDENCE_RANK[a.confidence ?? "low"] - CONFIDENCE_RANK[b.confidence ?? "low"],
      source: (a, b) => b.sourceDate.localeCompare(a.sourceDate),
    };
    return [...list].sort(by[sort]);
  }, [report, sort]);

  const th = (key: SortKey, label: string, className = "") => (
    <th className={`px-3 py-2 font-medium ${className}`}>
      <button type="button" onClick={() => setSort(key)} className={`inline-flex items-center gap-1 ${sort === key ? "text-zinc-100" : "hover:text-zinc-200"}`}>
        {label}
        <ArrowDownUp className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">{rows.length} entities. Click a row for its quote, context and connections.</p>
        <button
          type="button"
          onClick={() => download(report, rows)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV with quotes
        </button>
      </div>
      <div className="overflow-x-auto border border-zinc-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900 text-[11px] uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              {th("name", "Entity")}
              {th("type", "Type")}
              <th className="px-3 py-2 font-medium">Relationship</th>
              <th className="px-3 py-2 font-medium">Figure</th>
              {th("severity", "Severity")}
              {th("confidence", "Confidence")}
              {th("source", "Source")}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((e) => (
              <tr key={e.id} onClick={() => onSelect(e)} className={`cursor-pointer hover:bg-zinc-900 ${e.change?.kind === "removed" ? "opacity-50" : ""}`}>
                <td className="px-3 py-2.5">
                  <span className="font-medium text-zinc-100">{e.name}</span>
                  {e.change ? (
                    <span className={`ml-2 rounded-xs px-1 text-[10px] uppercase tracking-wide ${e.change.kind === "new" ? "bg-emerald-950 text-emerald-300" : e.change.kind === "removed" ? "bg-zinc-800 text-zinc-400" : "bg-amber-950 text-amber-300"}`}>
                      {e.change.kind}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                    <span className="h-2.5 w-2.5 rounded-xs" style={{ background: TYPE_HEX[e.type] }} aria-hidden />
                    {TYPE_LABELS[e.type]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-300">{relationText(e)}</td>
                <td className="max-w-[16rem] truncate px-3 py-2.5 font-mono text-xs text-zinc-200" title={e.magnitude?.label}>
                  {e.magnitude?.label ?? <span className="text-zinc-600">Not disclosed</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                    <span className="inline-flex gap-[3px]" aria-hidden>
                      {[0, 1, 2].map((i) => {
                        const color = e.severity === "none" ? "#a1a1aa" : SEVERITY_HEX[e.severity];
                        const on = i < SEVERITY_DOTS[e.severity];
                        return <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: on ? color : "transparent", border: on ? "none" : `1px solid ${color}` }} />;
                      })}
                    </span>
                    {e.severity}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400" title={e.confidenceBasis}>
                  {e.confidence ?? "n/a"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-zinc-500">
                  {e.sourceType === "News" ? e.sourceLabel : [e.sourceType, e.fiscalPeriod, e.sourcePage ? `p.${e.sourcePage}` : null].filter(Boolean).join(" · ")}
                  <span className="text-zinc-600"> · {e.sourceDate}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
