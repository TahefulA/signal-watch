import type { CapitalMetric, CapitalStructure, CompanyProfile } from "@/types";

interface FinancialMetricsPanelProps {
  capital: CapitalStructure | null | undefined;
  company: CompanyProfile;
}

const GROUPS: { title: string; keys: CapitalMetric["key"][] }[] = [
  { title: "Earnings", keys: ["revenue", "ebitda", "ebitda_margin", "fcf"] },
  { title: "Balance sheet", keys: ["total_debt", "net_debt", "cash", "current_ratio"] },
  { title: "Credit", keys: ["debt_to_ebitda", "net_debt_to_ebitda", "interest_coverage", "secured_share"] },
  { title: "Liquidity and maturities", keys: ["liquidity", "revolver_availability", "next_maturity"] },
];

/** Beside the map: the numbers a credit analyst reads first, each with how it was built on hover. */
export function FinancialMetricsPanel({ capital, company }: FinancialMetricsPanelProps) {
  if (!capital) return null;
  const byKey = new Map(capital.metrics.map((m) => [m.key, m]));
  const ratings = company.ratings ?? [];
  const period = capital.fiscalPeriod ? `${capital.fiscalPeriod}, ` : "";
  return (
    <section aria-labelledby="snapshot-title" className="border-b border-zinc-800 px-5 py-4">
      <h2 id="snapshot-title" className="font-display text-base font-bold text-zinc-100">
        Financial snapshot
      </h2>
      <p className="mt-1 font-mono text-[10px] text-zinc-500">
        As of {period}period ending {capital.asOf ?? "n/a"} · {capital.sourceType} filed {capital.sourceDate}
      </p>
      <div className="mt-3 space-y-3">
        {GROUPS.map((g) => {
          const rows = g.keys.map((k) => byKey.get(k)).filter((m): m is CapitalMetric => m !== undefined);
          if (rows.length === 0) return null;
          return (
            <div key={g.title}>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">{g.title}</p>
              <dl className="mt-1">
                {rows.map((m) => (
                  <div key={m.key} className="flex items-baseline justify-between gap-3 py-0.5 text-sm" title={m.note}>
                    <dt className="text-zinc-400">{m.label}</dt>
                    <dd className={`text-right font-mono ${m.display === "Not available" ? "text-zinc-500" : "text-zinc-100"}`}>{m.display}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Market</p>
          <dl className="mt-1">
            <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
              <dt className="text-zinc-400">Credit rating</dt>
              <dd className={`text-right font-mono ${ratings.length ? "text-zinc-100" : "text-zinc-500"}`}>
                {ratings.length ? ratings.map((r) => `${r.agency} ${r.rating}`).join(" / ") : "Not stated in filings read"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
              <dt className="text-zinc-400">Bond spread, price</dt>
              <dd className="text-right font-mono text-zinc-500">No bond price feed</dd>
            </div>
          </dl>
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer list-none text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
          How each figure is built
        </summary>
        <dl className="mt-2 space-y-1.5 text-[11px] leading-snug">
          {capital.metrics.map((m) => (
            <div key={m.key}>
              <dt className="inline text-zinc-300">{m.label}: </dt>
              <dd className="inline text-zinc-500">{m.note}</dd>
            </div>
          ))}
          <div>
            <dt className="inline text-zinc-300">Credit rating: </dt>
            <dd className="inline text-zinc-500">
              Shown only when a filing or headline states it, with that sentence. Signal Watch does not license rating agency data.
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
