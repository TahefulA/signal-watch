import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { TickerSummary } from "@/types";
import { Sparkline } from "./sparkline";

function changeText(change: number): { text: string; className: string } {
  if (Math.abs(change) < 0.05) return { text: "0.0", className: "text-zinc-500" };
  return {
    text: `${change > 0 ? "+" : ""}${change.toFixed(1)}`,
    className: change > 0 ? "text-red-400" : "text-emerald-400",
  };
}

export function SignalRow({ summary, rank }: { summary: TickerSummary; rank: number }) {
  const change = changeText(summary.change_7d);
  return (
    <li>
      <Link
        href={`/ticker/${summary.ticker}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-zinc-900 sm:grid-cols-[2rem_minmax(0,1fr)_6rem_5rem_1rem]"
      >
        <span className="hidden font-mono text-xs text-zinc-600 sm:block">{String(rank).padStart(2, "0")}</span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-3">
            <span className="font-mono text-base font-medium text-zinc-50">{summary.ticker}</span>
            <span className="truncate text-sm text-zinc-400">{summary.name}</span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{summary.reason}</span>
        </span>
        <Sparkline values={summary.sparkline} className="hidden sm:block" />
        <span className="text-right">
          <span className="block font-mono text-lg font-medium text-zinc-50">{summary.latest_score.toFixed(1)}</span>
          <span className={`block font-mono text-xs ${change.className}`}>{change.text} 7d</span>
        </span>
        <ChevronRight className="hidden h-4 w-4 text-zinc-600 group-hover:text-zinc-300 sm:block" aria-hidden />
      </Link>
    </li>
  );
}
