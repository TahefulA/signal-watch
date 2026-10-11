"use client";

import { ExternalLink } from "lucide-react";
import type { DebtInstrument, DebtKind, MaturityRow, Report, Seniority } from "@/types";
import { CitationBlock } from "@/components/ui/citation";
import { compactMoney } from "@/lib/node-visuals";
import { capitalItems, sectionItems, itemsFromPatterns, firedPatterns } from "@/lib/counter-view";
import { CounterArgumentsCard } from "./counter-arguments-card";
import { SectionTitle, TabHeader } from "./financial-tab";

const SENIORITY: Record<Seniority, string> = { senior_secured: "Senior secured", senior_unsecured: "Senior unsecured", subordinated: "Subordinated", other: "Other" };
const KIND: Record<DebtKind, string> = {
  revolver: "Revolver",
  term_loan: "Term loan",
  secured_notes: "Secured notes",
  unsecured_notes: "Unsecured notes",
  convertible_notes: "Convertible notes",
  other: "Other debt",
};

function amountOf(i: DebtInstrument): string {
  if (i.outstanding !== null) return compactMoney(i.outstanding);
  if (i.commitment !== null) return `${compactMoney(i.commitment)} facility`;
  return "Not disclosed";
}

/** Principal by final maturity year, used when the filing has no maturities table. */
function rowsFromInstruments(instruments: DebtInstrument[]): MaturityRow[] {
  const byYear = new Map<string, number>();
  for (const i of instruments) {
    if (!i.maturity || i.outstanding === null) continue;
    byYear.set(i.maturity.slice(0, 4), (byYear.get(i.maturity.slice(0, 4)) ?? 0) + i.outstanding);
  }
  return Array.from(byYear, ([period, amount]) => ({ period, amount })).sort((a, b) => a.period.localeCompare(b.period));
}

/** Weighted by disclosed principal; instruments without a principal or a maturity date are left out and counted. */
function weightedMaturity(instruments: DebtInstrument[], asOf: string | null): { years: number; covered: number; total: number } | null {
  if (!asOf) return null;
  const dated = instruments.filter((i) => i.outstanding !== null && i.maturity && /^\d{4}-\d{2}-\d{2}$/.test(i.maturity));
  const principal = dated.reduce((s, i) => s + (i.outstanding ?? 0), 0);
  if (!principal) return null;
  const years = dated.reduce((s, i) => s + (i.outstanding ?? 0) * ((Date.parse(i.maturity as string) - Date.parse(asOf)) / (365.25 * 86_400_000)), 0) / principal;
  return { years, covered: dated.length, total: instruments.length };
}

/** The capital structure: every instrument from the debt note, the maturity wall and the structure's key figures. */
export function CapitalTab({ report, devilBusy = false }: { report: Report; devilBusy?: boolean }) {
  const capital = report.capital;
  if (!capital) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-12">
        <TabHeader title="Capital structure" />
        <p className="text-sm text-zinc-500">
          {capital === undefined ? "This report predates the capital structure. Read the filings again to add it." : "No debt note was found in the latest periodic filing."}
        </p>
      </div>
    );
  }
  const total = capital.metrics.find((m) => m.key === "total_debt");
  const secured = capital.metrics.find((m) => m.key === "secured_share");
  const next = capital.metrics.find((m) => m.key === "next_maturity");
  const rows = capital.maturitySchedule?.rows ?? rowsFromInstruments(capital.instruments);
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const wam = weightedMaturity(capital.instruments, capital.asOf);
  const changes = capital.instruments.filter((i) => i.recentChange);
  const aggregate = capital.disclosure === "aggregate";
  const showIssuer = capital.instruments.some((i) => i.issuer);
  // An aggregate issuer leaves most cells blank by design; say so once instead of in every cell.
  const missing = aggregate ? <span className="text-zinc-600">&mdash;</span> : <span className="text-zinc-600">Not disclosed</span>;
  const xbrlBadge = (i: DebtInstrument, field: "coupon" | "maturity" | "outstanding") =>
    i.xbrlFields?.includes(field) ? (
      <span className="ml-1.5 rounded-xs border border-zinc-700 px-1 align-middle font-mono text-[9px] text-zinc-400" title="From the filing's inline XBRL tags; the footnote text did not state it">
        XBRL
      </span>
    ) : null;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-12">
      <TabHeader title="Capital structure" meta={`As of ${capital.fiscalPeriod ?? capital.asOf ?? "the latest filing"}${capital.asOf ? ` (period ending ${capital.asOf})` : ""} · ${capital.sourceType} filed ${capital.sourceDate}`} />

      <CounterArgumentsCard
        title="capital structure concerns"
        items={[...sectionItems(report.devil, ["debt"]), ...itemsFromPatterns(firedPatterns(report.devil, ["debt"], ["off_balance_sheet", "restricted_cash"])).concat(report.devil?.sections ? [] : capitalItems(report.devil))]}
        busy={devilBusy}
        empty={report.devil ? "No debt pattern fired: maturities, floating rate share, guarantees, subordination and pension funding were checked." : "The counter-argument has not been written yet."}
      />

      {capital.noteFallback ? <p className="mb-4 border-l-2 border-amber-600 pl-3 text-xs leading-relaxed text-zinc-400">{capital.noteFallback}</p> : null}
      {aggregate ? (
        <p className="mb-5 border-l-2 border-zinc-500 bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-300">
          This issuer discloses debt only in aggregate, by category, not instrument by instrument. Individual instrument-level detail (each note&rsquo;s coupon and maturity) is not
          provided in the {capital.sourceType}. Rows marked &ldquo;category total&rdquo; are the footnote&rsquo;s own categories, and their rates are weighted averages; named notes come from
          current reports filed since. Full detail, where published, is in the issuer&rsquo;s prospectus supplements rather than its periodic filings.
        </p>
      ) : null}
      {capital.instruments.length === 0 ? <p className="mb-4 text-sm text-zinc-500">No debt line in the footnote could be matched to a quote.</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="pb-3 pr-4 font-semibold">{aggregate ? "Category" : "Instrument"}</th>
              {showIssuer ? <th className="pb-3 pr-4 font-semibold">Issuer</th> : null}
              <th className="pb-3 pr-4 text-right font-semibold">Amount</th>
              <th className="pb-3 pr-4 font-semibold">Maturity</th>
              <th className="pb-3 pr-4 font-semibold">Coupon</th>
              <th className="pb-3 pr-4 font-semibold">Seniority</th>
              <th className="pb-3 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {capital.instruments.map((i) => (
              <tr key={i.id} className="border-t border-zinc-800 align-top">
                <td className="py-3 pr-4">
                  <p className="text-[13px] text-zinc-100">{i.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {KIND[i.kind]}
                    {i.aggregate ? " · category total" : ""}
                    {i.commitment !== null && i.outstanding === null ? " · drawn amount not disclosed" : ""}
                  </p>
                </td>
                {showIssuer ? <td className="py-3 pr-4 text-[13px] text-zinc-300">{i.issuer === "parent" ? "Parent" : i.issuer === "subsidiary" ? "Subsidiary" : "—"}</td> : null}
                <td className="whitespace-nowrap py-3 pr-4 text-right font-mono text-[13px] text-zinc-100">
                  {amountOf(i) === "Not disclosed" ? missing : amountOf(i)}
                  {xbrlBadge(i, "outstanding")}
                </td>
                <td className="whitespace-nowrap py-3 pr-4 font-mono text-[13px] text-zinc-300">
                  {i.maturity ?? (i.aggregate ? <span className="text-zinc-500">Various</span> : missing)}
                  {xbrlBadge(i, "maturity")}
                </td>
                <td className="py-3 pr-4 font-mono text-[13px] text-zinc-300">
                  {i.coupon ?? missing}
                  {xbrlBadge(i, "coupon")}
                </td>
                <td className="py-3 pr-4 text-[13px] text-zinc-300">{SENIORITY[i.seniority]}</td>
                <td className="py-3">
                  {i.citations[0] ? (
                    <details>
                      <summary className="cursor-pointer list-none font-mono text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
                        {i.citations[0].sourceType}
                        {i.citations[0].page ? ` p.${i.citations[0].page}` : ""}
                        {i.citations.length > 1 ? ` +${i.citations.length - 1}` : ""}
                      </summary>
                      <div className="mt-2 w-[22rem] max-w-[60vw]">
                        {i.citations.map((c) => (
                          <CitationBlock key={c.quote} citation={c} compact />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
            <tr className="border-t border-zinc-700" title={total?.note}>
              <td className="py-3 pr-4 text-[13px] font-semibold text-zinc-50">Total debt</td>
              <td className="py-3 pr-4 text-right font-mono text-[13px] font-semibold text-zinc-50">{total?.display ?? "Not available"}</td>
              <td colSpan={showIssuer ? 5 : 4} className="py-3 text-[11px] text-zinc-500">
                {total?.note}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <SectionTitle>Maturity wall</SectionTitle>
      {rows.length ? (
        <>
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.period} className="grid grid-cols-[96px_minmax(0,1fr)_72px] items-center gap-3">
                <span className="truncate text-right font-mono text-xs text-zinc-500" title={r.period}>
                  {r.period.replace("Remainder of ", "Rest of ")}
                </span>
                <span className="h-4">
                  <span className="block h-4 rounded-xs bg-blue-700" style={{ width: `${Math.max(0.5, (r.amount / max) * 100)}%` }} />
                </span>
                <span className="font-mono text-xs text-zinc-50">{compactMoney(r.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-zinc-500">
            {!capital.maturitySchedule
              ? "Principal by final maturity year, from the instruments above. The filing has no maturities table."
              : capital.maturitySchedule.source === "text"
                ? "Amounts by year or bucket as the footnote states them, each matched to its sentence or table row."
                : capital.maturitySchedule.source === "xbrl"
                  ? `The footnote text gives no schedule; these are the maturities the company tags in XBRL as of ${capital.maturitySchedule.asOf ?? "its last 10-K"}.`
                  : "Scheduled principal payments, read directly from the filing's maturities table."}
          </p>
          {capital.maturitySchedule && capital.maturitySchedule.source !== "xbrl" ? (
            <div className="mt-2 max-w-3xl">
              <CitationBlock citation={capital.maturitySchedule.citation} compact />
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-zinc-500">Not disclosed.</p>
      )}

      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2">
        <div>
          <SectionTitle>Key metrics</SectionTitle>
          {[
            { label: "Secured debt / total debt", value: secured?.display ?? "Not available", note: secured?.note },
            {
              label: "Weighted average maturity",
              value: wam ? `${wam.years.toFixed(1)} years` : "Not available",
              note: wam ? `Weighted by principal across the ${wam.covered} of ${wam.total} instruments with a disclosed principal and maturity date, from ${capital.asOf}.` : "No instrument has both a principal and a maturity date.",
            },
            { label: "Next final maturity", value: next?.display ?? "Not available", note: next?.note },
            { label: "Current spread", value: "No bond price feed", note: "Signal Watch does not license bond prices, so it cannot compute a spread." },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-zinc-800 py-3" title={row.note}>
              <span className="text-xs text-zinc-400">{row.label}</span>
              <span className={`font-mono text-sm font-medium ${/Not|No /.test(row.value) ? "text-zinc-500" : "text-zinc-100"}`}>{row.value}</span>
            </div>
          ))}
          {wam ? <p className="mt-2 text-[11px] text-zinc-500">Weighted average maturity covers {wam.covered} of {wam.total} instruments.</p> : null}
        </div>
        <div>
          <SectionTitle>Recent changes</SectionTitle>
          {changes.length ? (
            <ul className="space-y-3">
              {changes.map((i) => (
                <li key={i.id} className="text-[13px] leading-relaxed text-zinc-300">
                  <span className="text-zinc-50">{i.name}.</span> {i.recentChange}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">None described in the twelve months before the filing.</p>
          )}
          <a href={capital.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
            Debt note: {capital.sourceType} filed {capital.sourceDate} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>

      {capital.financials.length ? (
        <details className="mt-10 border-t border-zinc-800 pt-4">
          <summary className="cursor-pointer list-none text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">Reported XBRL figures used</summary>
          <ul className="mt-3 grid grid-cols-1 gap-x-12 gap-y-1.5 lg:grid-cols-2">
            {capital.financials.map((f) => (
              <li key={f.concept} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-mono text-zinc-400" title={f.concept}>
                  {f.concept} <span className="text-zinc-600">· {f.period}</span>
                </span>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-zinc-200 underline decoration-zinc-700 underline-offset-2">
                  {compactMoney(Math.abs(f.value))}
                  {f.value < 0 ? " loss" : ""}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
