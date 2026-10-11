"use client";

import type { SeriesPoint } from "@/lib/xbrl";

interface QuarterBarsProps {
  points: SeriesPoint[];
  /** Fill of the latest quarter; earlier quarters are grey. */
  color: string;
  height: number;
  /** For the tooltip, e.g. "$44.8M" or "-12.3%". */
  format: (value: number) => string;
  label: string;
  /** Delay before the bars grow in, in ms. */
  delayMs?: number;
}

/**
 * One bar per quarter, oldest on the left, drawn as boxes. Negative quarters
 * hang below the zero line in red. The bars grow once when they appear.
 */
export function QuarterBars({ points, color, height, format, label, delayMs = 0 }: QuarterBarsProps) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zero = (max / span) * height;
  const gap = 2;
  const width = 100;
  const bar = (width - gap * (points.length - 1)) / points.length;
  const tip = `${label}, by quarter: ${points.map((p) => `${p.end.slice(0, 7)} ${format(p.value)}`).join(", ")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label={tip}>
      <title>{tip}</title>
      {points.map((p, i) => {
        const h = Math.max(1, (Math.abs(p.value) / span) * height);
        const y = p.value >= 0 ? zero - h : zero;
        const last = i === points.length - 1;
        return (
          <rect
            key={p.end}
            x={i * (bar + gap)}
            y={y}
            width={bar}
            height={h}
            rx={0.6}
            className="quarter-bar"
            style={{
              fill: p.value < 0 ? "#dc2626" : last ? color : "#d4d4d8",
              opacity: p.value < 0 && !last ? 0.55 : 1,
              transformOrigin: `0 ${zero}px`,
              animationDelay: `${delayMs + i * 30}ms`,
            }}
          />
        );
      })}
      {min < 0 ? <line x1={0} x2={width} y1={zero} y2={zero} stroke="#a1a1aa" strokeWidth={0.5} vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}
