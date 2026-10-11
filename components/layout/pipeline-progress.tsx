"use client";

import { useEffect, useState } from "react";

export const PIPELINE_STEPS = [
  "Fetching SEC filings...",
  "Fetching news and market data...",
  "Extracting entities and debt...",
  "Verifying quotes...",
  "Writing the signal summary and memo...",
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

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" role="status" aria-live="polite">
      {PIPELINE_STEPS.map((label, i) => (
        <span
          key={label}
          className={i === current ? "text-zinc-100" : i < current ? "text-zinc-500" : "text-zinc-700"}
        >
          {label.replace("...", "")}
        </span>
      ))}
      <span className="font-mono text-zinc-500">{((now - startedAt) / 1000).toFixed(1)}s</span>
    </div>
  );
}
