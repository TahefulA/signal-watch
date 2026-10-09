import type { TickerSummary } from "@/types";
import { SignalRow } from "./signal-row";

export function SignalList({ summaries }: { summaries: TickerSummary[] }) {
  return (
    <section aria-labelledby="watch-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="watch-heading" className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Companies worth watching today
        </h2>
        <span className="text-xs text-zinc-500">Score 0 to 100, change over 7 days</span>
      </div>
      <ol className="divide-y divide-zinc-800 rounded-md border border-zinc-800 bg-zinc-900/50">
        {summaries.map((summary, i) => (
          <SignalRow key={summary.ticker} summary={summary} rank={i + 1} />
        ))}
      </ol>
    </section>
  );
}
