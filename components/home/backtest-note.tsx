import type { BacktestReport } from "@/types";
import { formatDate } from "@/lib/dates";

function pct(value: number | null): string {
  if (value === null) return "n/a";
  const v = Math.round(value * 1000) / 10;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function BacktestNote({ result }: { result: BacktestReport }) {
  const rows = result.thresholds;
  const primary = [...rows].reverse().find((r) => r.signals >= 10) ?? rows[0];
  return (
    <section aria-labelledby="backtest-heading" className="space-y-3">
      <h2 id="backtest-heading" className="text-xs font-medium uppercase tracking-widest text-zinc-500">
        Backtest
      </h2>
      <div className="rounded-md border border-zinc-800 p-5">
        {primary && primary.signals > 0 ? (
          <p className="text-sm leading-relaxed text-zinc-200">
            Across {primary.signals} times a company crossed a score of {primary.threshold}, the stock returned{" "}
            <span className="font-mono">{pct(primary.average_alpha)}</span> against its sector ETF over the next{" "}
            {result.horizon_days} days on average, and lagged its sector{" "}
            <span className="font-mono">{pct(primary.hit_rate)}</span> of the time.
          </p>
        ) : (
          <p className="text-sm text-zinc-200">No scores crossed the tested thresholds in this window.</p>
        )}
        <table className="mt-4 w-full text-left font-mono text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 font-normal">Score at least</th>
              <th className="py-1 text-right font-normal">Signals</th>
              <th className="py-1 text-right font-normal">Avg vs sector</th>
              <th className="py-1 text-right font-normal">Lagged</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {rows.map((r) => (
              <tr key={r.threshold} className="border-t border-zinc-800">
                <td className="py-1.5">{r.threshold}</td>
                <td className="py-1.5 text-right">{r.signals}</td>
                <td className="py-1.5 text-right">{pct(r.average_alpha)}</td>
                <td className="py-1.5 text-right">{pct(r.hit_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          {result.tickers.length} tickers, {formatDate(result.window_start)} to {formatDate(result.window_end)}. Entry
          on the session after the score crosses; alpha is the stock&rsquo;s return minus its sector ETF&rsquo;s. Small
          samples are noisy and past results do not predict future ones.
        </p>
      </div>
    </section>
  );
}
