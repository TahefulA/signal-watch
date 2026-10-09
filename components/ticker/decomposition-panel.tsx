"use client";

import { ChevronRight, X } from "lucide-react";
import type { ComponentKey, SignalScore } from "@/types";
import { COMPONENTS } from "@/lib/components";
import { formatDate } from "@/lib/dates";

interface DecompositionPanelProps {
  score: SignalScore;
  previous: SignalScore | null;
  activeComponent: ComponentKey | null;
  onBarClick: (key: ComponentKey) => void;
  onClose: () => void;
}

function barTone(value: number): string {
  if (value >= 60) return "bg-red-600";
  if (value >= 30) return "bg-amber-600";
  return "bg-zinc-400";
}

function formatChange(change: number): { text: string; className: string } {
  if (Math.abs(change) < 0.05) return { text: "no change", className: "text-zinc-500" };
  const sign = change > 0 ? "+" : "";
  return {
    text: `${sign}${change.toFixed(1)}`,
    className: change > 0 ? "text-red-400" : "text-emerald-400",
  };
}

export function DecompositionPanel({ score, previous, activeComponent, onBarClick, onClose }: DecompositionPanelProps) {
  const totalChange = previous ? score.total_score - previous.total_score : 0;
  const total = formatChange(totalChange);

  return (
    <section aria-labelledby="decomposition-heading" className="rounded-md border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Score breakdown</p>
          <h2 id="decomposition-heading" className="mt-1 text-sm text-zinc-300">
            {formatDate(score.date)}
          </h2>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-medium text-zinc-50">{score.total_score.toFixed(1)}</span>
            <span className={`font-mono text-sm ${total.className}`}>{total.text}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close breakdown"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <ul className="divide-y divide-zinc-800">
        {COMPONENTS.map((component) => {
          const value = score[component.key];
          const change = formatChange(previous ? value - previous[component.key] : 0);
          const contribution = value * component.weight;
          const count = score.drivers[component.key].length;
          const active = activeComponent === component.key;
          return (
            <li key={component.key}>
              <button
                type="button"
                onClick={() => onBarClick(component.key)}
                aria-pressed={active}
                className={`group w-full p-5 text-left transition-colors hover:bg-zinc-900 ${active ? "bg-zinc-900" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-zinc-100">
                    {component.label}
                    <span className="ml-2 font-mono text-xs font-normal text-zinc-500">
                      {Math.round(component.weight * 100)}%
                    </span>
                  </span>
                  <span className="flex items-baseline gap-2 font-mono text-sm">
                    <span className="text-zinc-50">{value.toFixed(0)}</span>
                    <span className="text-zinc-600">/100</span>
                    <span className={`text-xs ${change.className}`}>{change.text}</span>
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full rounded-xs bg-zinc-800" aria-hidden>
                  <div
                    className={`h-full rounded-xs ${barTone(value)}`}
                    style={{ width: `${Math.max(value, value > 0 ? 1.5 : 0)}%` }}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-zinc-400">{score.notes[component.key]}</p>
                <p className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-mono">adds {contribution.toFixed(1)} pts</span>
                  <span className="inline-flex items-center gap-1 group-hover:text-zinc-300">
                    {count === 0 ? "No sources" : `${count} source${count === 1 ? "" : "s"}`}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </span>
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
