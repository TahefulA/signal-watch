"use client";

import { useEffect, useState } from "react";

export const PIPELINE_STEPS = [
  "Fetching SEC filings...",
  "Fetching news and market data...",
  "Extracting entities and debt...",
  "Verifying quotes...",
  "Writing the signal summary and memo...",
  "Scoring distress, filing changes and rate risk...",
];

interface PipelineProgressProps {
  step: string;
  startedAt: number;
}

export function PipelineProgress({ step, startedAt }: PipelineProgressProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const current = PIPELINE_STEPS.indexOf(step);

  const done = Math.max(0, current);
  return (
    <div className="mx-auto max-w-2xl py-10">
      <p className="text-lg font-semibold text-zinc-100">Reading this company&rsquo;s filings</p>
      <p className="mt-1 text-sm text-zinc-400">The first analysis of a company takes about a minute. After that it opens instantly for everyone.</p>
      <div className="mt-5 h-1 rounded-[2px] bg-zinc-800">
        <div className="h-full rounded-[2px] bg-red-600 transition-[width] duration-500" style={{ width: `${((done + 0.5) / PIPELINE_STEPS.length) * 100}%` }} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" role="status" aria-live="polite">
      {PIPELINE_STEPS.map((label, i) => (
        <span
          key={label}
          className={i === current ? "text-zinc-100" : i < current ? "text-zinc-500" : "text-zinc-700"}
        >
          {label.replace("...", "")}
        </span>
      ))}
      <span className="font-mono text-zinc-500">{((now - startedAt) / 1000).toFixed(0)}s</span>
      </div>
    </div>
  );
}
