import type { Report } from "@/types";
import { CapitalStructurePanel } from "@/components/capital/capital-structure-panel";
import { FinancialMetricsPanel } from "@/components/capital/financial-metrics-panel";
import { Card, Stat } from "@/components/ui/section";
import { marketLtv, marketView, metric, moneyOf, nearTermMaturities, runway } from "@/lib/credit-view";
import { compactMoney } from "@/lib/node-visuals";


/** Equity price and size: the cushion under the debt, and what drives the convertibles. */
function MarketCard({ report }: { report: Report }) {
  const m = marketView(report);
  const ltv = marketLtv(report);
  const net = moneyOf(metric(report, "net_debt")?.display);
  const ev = net && report.market?.marketCap ? net.value + report.market.marketCap : null;
  const derived = [runway(report), nearTermMaturities(report)].filter((d): d is NonNullable<typeof d> => d !== null);
  return (
    <Card title="Market and equity cushion" why="The equity below the debt, and how the market is pricing the name.">
      {m && report.market ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Share price" value={m.price} sub={`Close ${m.priceDate}`} />
            <Stat label="90-day change" value={m.change90d} sub={m.relative90d ? `${m.relative90d} vs ${m.benchmark}` : null} tone={report.market.return90d < -0.2 ? "stress" : report.market.return90d < 0 ? "watch" : "neutral"} />
            <Stat label="Market cap" value={m.marketCap ?? "Not available"} muted={!m.marketCap} />
            <Stat label="Enterprise value" value={ev ? compactMoney(ev) : "Not available"} sub="Market cap + net debt" muted={!ev} />
          </div>
          <div>
            <div className="flex items-baseline justify-between text-[11px] text-zinc-400">
              <span>52-week range</span>
              <span className="font-mono text-zinc-300">{m.range52w}</span>
            </div>
            <div className="relative mt-2 h-1.5 rounded-xs bg-zinc-800" aria-hidden>
              <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-100" style={{ left: `${Math.min(100, Math.max(0, m.rangePosition * 100))}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">{(m.rangePosition * 100).toFixed(0)}% of the way from the 52-week low to the high.</p>
          </div>
          {ltv ? (
            <div className="border-t border-zinc-800 pt-4">
              <Stat label={ltv.label} value={ltv.display} sub={ltv.why} note={ltv.note} tone={ltv.tone} />
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{ltv.note}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No market data was available for this ticker.</p>
      )}
      {derived.length ? (
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          {derived.map((d) => (
            <div key={d.label}>
              <Stat label={d.label} value={d.display} sub={d.why} note={d.note} tone={d.tone} />
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{d.note}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/** The numbers: earnings and credit metrics, the debt stack and maturities, and the market's view. */
export function FinancialsTab({ report, peers }: { report: Report; peers: Report[] }) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
      <Card title="Earnings and credit metrics" why="Trailing twelve months from the company's XBRL data, with reference bands and the peers on screen.">
        <FinancialMetricsPanel capital={report.capital} company={report.graph.company} peers={peers} />
        {!report.capital ? <p className="text-sm text-zinc-500">This report predates the financial snapshot. Read the filings again to add it.</p> : null}
      </Card>
      <div className="rounded-xs border border-zinc-800 bg-zinc-900/60">
        <CapitalStructurePanel capital={report.capital} />
      </div>
      <MarketCard report={report} />
    </div>
  );
}
