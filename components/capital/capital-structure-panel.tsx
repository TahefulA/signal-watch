"use client";

import { ExternalLink } from "lucide-react";
import { forwardRef } from "react";
import type { CapitalStructure, DebtInstrument, DebtKind, MaturityRow, Seniority } from "@/types";
import { CitationBlock } from "@/components/ui/citation";

const SENIORITY_LABEL: Record<Seniority, string> = {
  senior_secured: "Senior secured",
  senior_unsecured: "Senior unsecured",
  subordinated: "Subordinated",
  other: "Other",
};

const KIND_LABEL: Record<DebtKind, string> = {
  revolver: "Revolver",
  term_loan: "Term loan",
  secured_notes: "Secured notes",
  unsecured_notes: "Unsecured notes",
  convertible_notes: "Convertible notes",
  other: "Other debt",
};

function compact(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${Math.round(value / 1e6).toLocaleString("en-US")}M`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">{children}</h3>;
}

function InstrumentRow({ instrument, scale }: { instrument: DebtInstrument; scale: number }) {
  const amount = instrument.outstanding;
  const commitment = instrument.commitment;
  const barWidth = (value: number) => `${Math.max(1.5, (value / scale) * 100)}%`;
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-zinc-100">{instrument.name}</span>
        <span className="shrink-0 font-mono text-xs text-zinc-200">
          {amount !== null ? compact(amount) : commitment !== null ? `${compact(commitment)} facility` : "Not disclosed"}
        </span>
      </div>
      <div className="relative mt-1.5 h-2 bg-zinc-900" aria-hidden>
        {commitment !== null ? <div className="absolute inset-y-0 left-0 border border-emerald-600" style={{ width: barWidth(commitment) }} /> : null}
        {amount !== null ? <div className="absolute inset-y-0 left-0 bg-emerald-600" style={{ width: barWidth(amount) }} /> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-500">
        <span>{KIND_LABEL[instrument.kind]}</span>
        <span>Matures {instrument.maturity ?? "not disclosed"}</span>
        <span>Coupon {instrument.coupon ?? "not disclosed"}</span>
        {commitment !== null && amount === null ? <span>Drawn amount not disclosed</span> : null}
      </div>
      <details className="group mt-1.5">
        <summary className="cursor-pointer list-none text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
          {instrument.citations.length === 1 ? "Source" : `Sources (${instrument.citations.length})`}
        </summary>
        {instrument.citations.map((c) => (
          <CitationBlock key={c.quote} citation={c} compact />
        ))}
      </details>
    </li>
  );
}

function MaturityBars({ rows, note }: { rows: MaturityRow[]; note: string }) {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <div>
      <div className="mt-3 flex h-32 items-end gap-2">
        {rows.map((r) => (
          <div key={r.period} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="font-mono text-[10px] text-zinc-300">{compact(r.amount)}</span>
            <div className="w-full bg-emerald-600" style={{ height: `${Math.max(2, (r.amount / max) * 88)}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 border-t border-zinc-700 pt-1">
        {rows.map((r) => (
          <span key={r.period} className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-zinc-500" title={r.period}>
            {r.period.replace("Remainder of ", "Rest of ")}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">{note}</p>
    </div>
  );
}

/** Maturity years from instrument terms, used when the filing has no maturities table. */
function rowsFromInstruments(instruments: DebtInstrument[]): MaturityRow[] {
  const byYear = new Map<string, number>();
  for (const i of instruments) {
    if (!i.maturity || i.outstanding === null) continue;
    const year = i.maturity.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + i.outstanding);
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, amount]) => ({ period, amount }));
}

interface CapitalStructurePanelProps {
  capital: CapitalStructure | null | undefined;
  className?: string;
}

export const CapitalStructurePanel = forwardRef<HTMLElement, CapitalStructurePanelProps>(function CapitalStructurePanel(
  { capital, className = "" },
  ref,
) {
  if (!capital) {
    return (
      <aside ref={ref} className={`border border-zinc-800 p-5 ${className}`} aria-labelledby="capital-title">
        <h2 id="capital-title" className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Capital structure
        </h2>
        <p className="mt-3 text-sm text-zinc-500">
          {capital === undefined
            ? "This report was generated before the capital structure panel existed. Read the filings again to add it."
            : "No debt note was found in the latest periodic filing."}
        </p>
      </aside>
    );
  }

  const scale = Math.max(1, ...capital.instruments.map((i) => Math.max(i.outstanding ?? 0, i.commitment ?? 0)));
  const groups = (Object.keys(SENIORITY_LABEL) as Seniority[])
    .map((s) => ({ seniority: s, items: capital.instruments.filter((i) => i.seniority === s) }))
    .filter((g) => g.items.length > 0);
  const changes = capital.instruments.filter((i) => i.recentChange);
  const derivedRows = rowsFromInstruments(capital.instruments);

  return (
    <aside ref={ref} className={`border border-zinc-800 ${className}`} aria-labelledby="capital-title">
      <div className="border-b border-zinc-800 px-5 py-4">
        <h2 id="capital-title" className="font-display text-base font-bold text-zinc-100">
          Capital structure
        </h2>
        <p className="mt-1 font-mono text-[10px] text-zinc-500">
          {capital.asOf ? `As of ${capital.asOf} · ` : ""}
          <a
            href={capital.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200"
          >
            {capital.sourceType} filed {capital.sourceDate}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </p>
      </div>

      <div className="space-y-6 px-5 py-5">
        <section>
          <Heading>Key metrics</Heading>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
            {capital.metrics.map((m) => (
              <div key={m.key} className="min-w-0">
                <dt className="text-[11px] text-zinc-500">{m.label}</dt>
                <dd className="mt-0.5 font-mono text-sm text-zinc-100">{m.display}</dd>
                <dd className="mt-1 text-[11px] leading-snug text-zinc-500">{m.note}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <Heading>Debt stack</Heading>
          {capital.instruments.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No instrument could be matched to a sentence in the debt note.</p>
          ) : (
            groups.map((g) => (
              <div key={g.seniority} className="mt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{SENIORITY_LABEL[g.seniority]}</p>
                <ul className="divide-y divide-zinc-800/80">
                  {g.items.map((i) => (
                    <InstrumentRow key={i.id} instrument={i} scale={scale} />
                  ))}
                </ul>
              </div>
            ))
          )}
          <p className="mt-2 text-[11px] text-zinc-500">Solid bar: outstanding principal. Outline: total commitment.</p>
        </section>

        <section>
          <Heading>Maturity profile</Heading>
          {capital.maturitySchedule ? (
            <>
              <MaturityBars
                rows={capital.maturitySchedule.rows}
                note="Scheduled principal payments, read directly from the filing's maturities table."
              />
              <CitationBlock citation={capital.maturitySchedule.citation} compact />
            </>
          ) : derivedRows.length > 0 ? (
            <MaturityBars rows={derivedRows} note="Principal by final maturity year, from the instruments above. The filing has no maturities table." />
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Not disclosed</p>
          )}
        </section>

        <section>
          <Heading>Recent changes</Heading>
          {changes.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">None described in the twelve months before the filing.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {changes.map((i) => (
                <li key={i.id} className="text-sm text-zinc-300">
                  <span className="text-zinc-100">{i.name}.</span> {i.recentChange}
                </li>
              ))}
            </ul>
          )}
        </section>

        {capital.financials.length > 0 ? (
          <section>
            <Heading>Reported figures used</Heading>
            <ul className="mt-3 space-y-1.5">
              {capital.financials.map((f) => (
                <li key={f.concept} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-mono text-zinc-400" title={f.concept}>
                    {f.concept}
                    <span className="text-zinc-600"> · {f.period}</span>
                  </span>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-mono text-zinc-200 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-50"
                  >
                    {compact(Math.abs(f.value))}
                    {f.value < 0 ? " loss" : ""}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-zinc-500">
              From the company&rsquo;s XBRL data on SEC EDGAR. Twelve-month figures are last fiscal year plus year to date,
              less the same period a year earlier.
            </p>
          </section>
        ) : null}
      </div>
    </aside>
  );
});
