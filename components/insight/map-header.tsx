"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { Report } from "@/types";

function utc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** Above the map: when it was built, from which filing, and what quote validation did. */
export function MapHeader({ report }: { report: Report }) {
  const periodic = report.sources
    .filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const v = report.validation;
  const severe = v ? v.rejected.length > v.proposed / 2 : false;
  const some = v ? v.rejected.length > 0 : false;
  return (
    <div className="mb-3 space-y-1.5">
      <p className="font-mono text-[11px] text-zinc-500">
        Last updated {utc(report.generatedAt)}
        {periodic ? ` · Based on ${periodic.sourceType}${periodic.fiscalPeriod ? ` (${periodic.fiscalPeriod})` : ""} filed ${periodic.date}` : ""}
      </p>
      {v ? (
        <details className="group text-xs">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-zinc-300">
            {some ? (
              <TriangleAlert className={`h-3.5 w-3.5 ${severe ? "text-red-500" : "text-amber-500"}`} aria-hidden />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            )}
            <span>
              {v.kept} of {v.proposed} proposed entities verified against the source text
              {v.rejected.length ? `; ${v.rejected.length} rejected` : ""}
              {v.merges.length ? `; ${v.merges.length} duplicate${v.merges.length > 1 ? "s" : ""} merged` : ""}
              {v.debtAdded ? `; ${v.debtAdded} debt instruments added from the debt note` : ""}.
            </span>
            <span className="text-zinc-500 underline decoration-zinc-700 underline-offset-4">Details</span>
          </summary>
          <div className="mt-2 max-w-3xl space-y-2 border-l border-zinc-800 pl-3 text-zinc-400">
            <p>
              Every box&rsquo;s quote was searched for in the filing or headline it cites. Entities whose quote was not found, or
              whose claimed relationship the quote does not support, are left off the map.
              {v.retried ? " The first extraction kept too few entities, so it was run again." : ""}
            </p>
            {v.rejected.length ? (
              <ul className="space-y-1">
                {v.rejected.map((r) => (
                  <li key={`${r.name}-${r.reason}`}>
                    <span className="text-zinc-200">{r.name}</span>: {r.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            {v.merges.length ? (
              <ul className="space-y-1">
                {v.merges.map((m) => (
                  <li key={`${m.kept}-${m.merged}`}>
                    Merged <span className="text-zinc-200">{m.merged}</span> into <span className="text-zinc-200">{m.kept}</span> ({m.reason})
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
