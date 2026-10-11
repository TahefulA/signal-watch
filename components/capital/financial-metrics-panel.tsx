"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { CapitalMetric, CapitalStructure, CompanyProfile, CreditRating, Report } from "@/types";
import type { HistoryResponse } from "@/app/api/history/route";
import { compactMoney } from "@/lib/node-visuals";

interface FinancialMetricsPanelProps {
  capital: CapitalStructure | null | undefined;
  company: CompanyProfile;
  /** Peer reports on screen; their ratios are marked on the bars. */
  peers?: Report[];
}

type Key = CapitalMetric["key"];

/**
 * Reference bands for each ratio: a common rule of thumb in leveraged credit,
 * not a rating model. Lower is better for leverage, higher for coverage.
 */
export const BANDS: Partial<Record<Key, { max: number; watch: number; stress: number; higherIsBetter: boolean; note: string }>> = {
  debt_to_ebitda: { max: 8, watch: 3, stress: 6, higherIsBetter: false, note: "Bands: under 3x, 3x to 6x, over 6x" },
  net_debt_to_ebitda: { max: 8, watch: 3, stress: 6, higherIsBetter: false, note: "Bands: under 3x, 3x to 6x, over 6x" },
  interest_coverage: { max: 8, watch: 3, stress: 1.5, higherIsBetter: true, note: "Bands: under 1.5x, 1.5x to 3x, over 3x" },
  current_ratio: { max: 3, watch: 1.5, stress: 1, higherIsBetter: true, note: "Bands: under 1.0x, 1.0x to 1.5x, over 1.5x" },
};

const SECTIONS: { title: string; keys: Key[] }[] = [
  { title: "Financial snapshot", keys: ["revenue", "ebitda", "ebitda_margin", "total_debt", "net_debt", "cash", "fcf"] },
  { title: "Credit metrics", keys: ["debt_to_ebitda", "net_debt_to_ebitda", "interest_coverage", "current_ratio", "secured_share"] },
];

const LIQUIDITY: Key[] = ["cash", "revolver_availability", "liquidity", "next_maturity"];

export function multipleOf(display: string): number | null {
  const m = display.match(/^(-?\d+(?:\.\d+)?)x$/);
  return m ? Number(m[1]) : null;
}

function SectionHeader({ children }: { children: string }) {
  return <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{children}</h3>;
}

export function Sparkline({ points, label, large = false, percent = false }: { points: { end: string; value: number }[]; label: string; large?: boolean; percent?: boolean }) {
  if (points.length < 2) return null;
  const width = large ? 240 : 48;
  const height = large ? 60 : 18;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * width).toFixed(1)},${(height - 1 - ((p.value - min) / span) * (height - 2)).toFixed(1)}`)
    .join(" ");
  const tip = `${label}, quarter by quarter from XBRL: ${points.map((p) => `${p.end.slice(0, 7)} ${percent ? `${p.value.toFixed(1)}%` : compactMoney(p.value)}`).join(", ")}`;
  return (
    <span className={`tip ${large ? "block" : "shrink-0"}`} data-tip={tip}>
      <svg
        width={large ? undefined : width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={large ? "none" : undefined}
        aria-label={tip}
        role="img"
        className={large ? "block h-[60px] w-full" : "block"}
      >
        <path d={d} fill="none" stroke="#10b981" strokeWidth={large ? 1.5 : 1.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

function MetricRow({ metric, spark }: { metric: CapitalMetric; spark?: ReactNode }) {
  const missing = metric.display === "Not available" || metric.display === "Not reconciled";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-800 py-2 last:border-b-0" title={metric.note}>
      <span className="min-w-0 text-[11px] leading-snug text-zinc-400">{metric.label}</span>
      <span className="flex shrink-0 items-center gap-3">
        {spark}
        <span className={`whitespace-nowrap text-right font-mono text-sm font-medium ${missing ? "text-zinc-500" : metric.display === "n/m" ? "text-zinc-400" : "text-zinc-100"}`}>
          {metric.display}
        </span>
      </span>
    </div>
  );
}

/** Where the ratio sits against the reference bands, with each peer's value as a hollow marker. */
export function RatioBar({
  metric,
  peers,
  average = null,
}: {
  metric: CapitalMetric;
  peers: { ticker: string; value: number }[];
  /** The ratio's average over the selected quarters, drawn as a tick. */
  average?: { value: number; label: string } | null;
}) {
  const bands = BANDS[metric.key];
  const value = multipleOf(metric.display);
  if (!bands) return <MetricRow metric={metric} />;
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / bands.max) * 100))}%`;
  const low = Math.min(bands.watch, bands.stress);
  const high = Math.max(bands.watch, bands.stress);
  const [first, middle, last] = bands.higherIsBetter ? ["#dc2626", "#d97706", "#059669"] : ["#059669", "#d97706", "#dc2626"];
  return (
    <div className="border-b border-zinc-800 py-2 last:border-b-0" title={metric.note}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-zinc-400">{metric.label}</span>
        <span className={`font-mono text-sm font-medium ${value === null ? "text-zinc-400" : "text-zinc-100"}`}>{metric.display}</span>
      </div>
      <div className="relative mt-1.5 h-1.5" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-l-xs opacity-30" style={{ width: at(low), background: first }} />
        <div className="absolute inset-y-0 opacity-30" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})`, background: middle }} />
        <div className="absolute inset-y-0 right-0 rounded-r-xs opacity-30" style={{ left: at(high), background: last }} />
        {peers.map((p) => (
          <span
            key={p.ticker}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-300 bg-zinc-900"
            style={{ left: at(p.value) }}
            title={`${p.ticker} ${p.value.toFixed(1)}x`}
          />
        ))}
        {average ? (
          <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 bg-zinc-400" style={{ left: at(average.value) }} title={`Average ${average.label}: ${average.value.toFixed(1)}x`} />
        ) : null}
        {value !== null ? (
          <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-100" style={{ left: at(value) }} />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] text-zinc-500">
        <span>{value === null ? (metric.display === "n/m" ? "Not meaningful: see note" : "No value") : `${bands.note.replace("Bands: ", "")}`}</span>
        <span>
          {average ? `| avg ${average.value.toFixed(1)}x  ` : ""}
          {peers.map((p) => `○ ${p.ticker} ${p.value.toFixed(1)}x`).join("  ")}
        </span>
      </div>
    </div>
  );
}

/** S&P and Fitch notches; Moody's mapped to the same steps. */
const NOTCHES = ["CCC-", "CCC", "CCC+", "B-", "B", "B+", "BB-", "BB", "BB+", "BBB-", "BBB", "BBB+", "A-", "A", "A+", "AA-", "AA", "AA+", "AAA"];
const MOODYS: Record<string, string> = {
  Caa3: "CCC-", Caa2: "CCC", Caa1: "CCC+", B3: "B-", B2: "B", B1: "B+", Ba3: "BB-", Ba2: "BB", Ba1: "BB+",
  Baa3: "BBB-", Baa2: "BBB", Baa1: "BBB+", A3: "A-", A2: "A", A1: "A+", Aa3: "AA-", Aa2: "AA", Aa1: "AA+", Aaa: "AAA",
};

function notchOf(rating: CreditRating): number {
  return NOTCHES.indexOf(MOODYS[rating.rating] ?? rating.rating.toUpperCase());
}

export function RatingGauge({ ratings }: { ratings: CreditRating[] }) {
  const placed = ratings.map((r) => ({ r, notch: notchOf(r) })).filter((x) => x.notch >= 0);
  if (!placed.length) return null;
  const at = (i: number) => `${(i / (NOTCHES.length - 1)) * 100}%`;
  const ig = NOTCHES.indexOf("BBB-");
  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-xs bg-zinc-800" aria-hidden>
        <div className="absolute inset-y-[-3px] w-px bg-zinc-500" style={{ left: at(ig) }} />
        {placed.map(({ r, notch }) => (
          <span key={r.agency} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-100" style={{ left: at(notch) }} title={`${r.agency} ${r.rating}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
        <span>CCC-</span>
        <span>B</span>
        <span>BB</span>
        <span className="text-zinc-400">BBB- IG</span>
        <span>A</span>
        <span>AAA</span>
      </div>
    </div>
  );
}

/** Up to eight quarters of revenue and cash from XBRL, for sparklines and quarter-on-quarter changes. */
export function useHistory(cik: string | undefined, through: string | null | undefined): HistoryResponse | null {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  useEffect(() => {
    setHistory(null);
    if (!through || !cik) return;
    let live = true;
    fetch(`/api/history?cik=${encodeURIComponent(cik)}&through=${through}`)
      .then((r) => (r.ok ? (r.json() as Promise<HistoryResponse>) : null))
      .then((h) => live && setHistory(h))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [cik, through]);
  return history;
}

/** Beside the map: the numbers a credit analyst reads first, each with how it was built on hover. */
export function FinancialMetricsPanel({ capital, company, peers = [] }: FinancialMetricsPanelProps) {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const through = capital?.asOf ?? null;

  useEffect(() => {
    setHistory(null);
    if (!through || !company.cik) return;
    let live = true;
    fetch(`/api/history?cik=${encodeURIComponent(company.cik)}&through=${through}`)
      .then((r) => (r.ok ? (r.json() as Promise<HistoryResponse>) : null))
      .then((h) => live && setHistory(h))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [company.cik, through]);

  if (!capital) return null;
  const byKey = new Map(capital.metrics.map((m) => [m.key, m]));
  const ratings = company.ratings ?? [];
  const peerValues = (key: Key) =>
    peers
      .map((p) => ({ ticker: p.graph.company.ticker, value: multipleOf(p.capital?.metrics.find((m) => m.key === key)?.display ?? "") }))
      .filter((p): p is { ticker: string; value: number } => p.value !== null);
  const sparkFor = (key: Key) =>
    key === "revenue" && history?.revenue.length ? (
      <Sparkline points={history.revenue} label="Revenue" />
    ) : key === "cash" && history?.cash.length ? (
      <Sparkline points={history.cash} label="Cash" />
    ) : null;
  const rows = (keys: Key[]) => keys.map((k) => byKey.get(k)).filter((m): m is CapitalMetric => m !== undefined);

  return (
    <section aria-labelledby="snapshot-title" className="border-b border-zinc-800 p-4">
      <h2 id="snapshot-title" className="sr-only">
        Financial snapshot
      </h2>
      <p className="font-mono text-[10px] leading-snug text-zinc-500">
        As of {capital.fiscalPeriod ?? "the latest filing"} (period ending {capital.asOf ?? "n/a"}) · {capital.sourceType} filed {capital.sourceDate}
      </p>

      {SECTIONS.map((section) => (
        <div key={section.title} className="mt-4">
          <SectionHeader>{section.title}</SectionHeader>
          <div className="mt-1">
            {rows(section.keys).map((m) =>
              BANDS[m.key] ? <RatioBar key={m.key} metric={m} peers={peerValues(m.key)} /> : <MetricRow key={m.key} metric={m} spark={sparkFor(m.key)} />,
            )}
          </div>
        </div>
      ))}

      <div className="mt-4">
        <SectionHeader>Credit rating</SectionHeader>
        <div className="mt-1">
          {ratings.length ? (
            ratings.map((r) => (
              <div key={`${r.agency}-${r.rating}`} className="flex items-center justify-between gap-3 border-b border-zinc-800 py-2" title={r.citation.quote}>
                <span className="text-[11px] text-zinc-400">{r.agency}{r.subject ? `, ${r.subject}` : ""}</span>
                <span className="font-mono text-sm font-medium text-zinc-100">
                  {r.rating}
                  {r.outlook ? <span className="text-zinc-400"> {r.outlook}</span> : null}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 py-2">
              <span className="text-[11px] text-zinc-400">Agency rating</span>
              <span className="font-mono text-sm text-zinc-500">Not stated in filings read</span>
            </div>
          )}
          <RatingGauge ratings={ratings} />
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-[11px] text-zinc-400">Bond spread, price</span>
            <span className="font-mono text-sm text-zinc-500">No bond price feed</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <SectionHeader>Liquidity</SectionHeader>
        <div className="mt-1">
          {rows(LIQUIDITY).map((m) => (
            <MetricRow key={m.key} metric={m} />
          ))}
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
            <dt className="inline text-zinc-300">Ratio bands: </dt>
            <dd className="inline text-zinc-500">
              Common leveraged-credit rules of thumb, shown for orientation only. Hollow markers are the peers on screen.
            </dd>
          </div>
          <div>
            <dt className="inline text-zinc-300">Sparklines: </dt>
            <dd className="inline text-zinc-500">Quarterly revenue and quarter-end cash from the company&rsquo;s XBRL data, up to eight quarters.</dd>
          </div>
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
