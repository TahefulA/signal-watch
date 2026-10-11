"use client";

import { useCallback, useRef, useState } from "react";
import type { SeriesPoint } from "@/lib/xbrl";

export interface ChartSeries {
  label: string;
  /** Fill or stroke for positive values; negatives are always red. */
  color: string;
  points: SeriesPoint[];
}

export interface TrendChartProps {
  title: string;
  /** One series, or two drawn as grouped bars (e.g. revenue and EBITDA). */
  series: ChartSeries[];
  kind: "bar" | "line";
  /** Full-precision value text for the readout, e.g. "$44.8M" or "-266.3%". */
  format: (value: number) => string;
  /** Shorter text for the axis ticks. */
  tick?: (value: number) => string;
  /** How the change between quarters is written: percent, percentage points or a difference. */
  change: "pct" | "pts" | "diff";
  quarterLabel: (end: string) => string;
  /** A horizontal reference line, e.g. 1.0x for the current ratio. */
  reference?: { value: number; label: string } | null;
  note?: string;
  height?: number;
  className?: string;
  /** Hide the latest value and change in the header, e.g. for projections. */
  hideSummary?: boolean;
}

const NEGATIVE = "#dc2626";
const PAD = { top: 18, right: 12, bottom: 26, left: 56 };

/** Round tick steps (1, 2, 2.5, 5 x 10^n) covering the range in about four steps. */
function ticks(min: number, max: number): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

function changeText(now: number, before: number | undefined, mode: TrendChartProps["change"], format: (v: number) => string): string | null {
  if (before === undefined) return null;
  if (mode === "pct") {
    if (before <= 0) return null;
    const p = ((now - before) / before) * 100;
    return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  }
  const d = now - before;
  if (mode === "pts") return `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts`;
  return `${d >= 0 ? "+" : "-"}${format(Math.abs(d))}`;
}

/** The value about a year before this point, within three weeks. */
function yearBefore(points: SeriesPoint[], end: string): number | undefined {
  const target = new Date(`${end}T00:00:00Z`).getTime() - 365 * 86_400_000;
  return points.find((p) => Math.abs(new Date(`${p.end}T00:00:00Z`).getTime() - target) < 21 * 86_400_000)?.value;
}

/** The element's width, kept current; a callback ref, so it works when the element appears later. */
function useWidth() {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.current.observe(el);
  }, []);
  return [ref, width] as const;
}

/**
 * A quarterly chart with a value axis, quarter labels and a readout: hover a
 * quarter to see its exact figures and the change against the prior quarter and
 * the same quarter a year earlier. Bars grow once on load; nothing loops.
 */
export function TrendChart({ title, series, kind, format, tick = format, change, quarterLabel, reference = null, note, height = 210, className = "", hideSummary = false }: TrendChartProps) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const primary = series[0];
  const ends = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.end)))).sort();
  if (!primary || ends.length < 2) return null;

  const all = series.flatMap((s) => s.points.map((p) => p.value)).concat(reference ? [reference.value] : []);
  const lo = Math.min(kind === "bar" ? 0 : Math.min(...all), ...all);
  const hi = Math.max(kind === "bar" ? 0 : Math.max(...all), ...all);
  const yTicks = ticks(lo, hi);
  const y0 = Math.min(lo, yTicks[0]);
  const y1 = Math.max(hi, yTicks[yTicks.length - 1]);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH;
  const slot = plotW / ends.length;
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const groupW = Math.min(slot * 0.7, 44);
  const barW = groupW / series.length;

  const latestEnd = ends[ends.length - 1];
  const latest = primary.points.find((p) => p.end === latestEnd) ?? primary.points[primary.points.length - 1];
  const prevOf = (s: ChartSeries, end: string) => {
    const i = s.points.findIndex((p) => p.end === end);
    return i > 0 ? s.points[i - 1].value : undefined;
  };
  const yoy = changeText(latest.value, yearBefore(primary.points, latest.end), change, format);
  const yoyUp = (yearBefore(primary.points, latest.end) ?? latest.value) <= latest.value;
  const peak = primary.points.reduce((a, b) => (b.value > a.value ? b : a));
  const trough = primary.points.reduce((a, b) => (b.value < a.value ? b : a));
  const shownEnd = hover !== null ? ends[hover] : null;
  // Every other label when the quarters are crowded.
  const every = slot < 46 ? 2 : 1;

  return (
    <figure className={`chart-card surface rounded-xs border border-zinc-800 p-5 ${className}`}>
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</p>
          <p className={`mt-1.5 flex items-baseline gap-2 ${hideSummary ? "hidden" : ""}`}>
            <span className={`font-display text-2xl font-semibold tabular-nums ${latest.value < 0 ? "text-red-400" : "text-zinc-50"}`}>{format(latest.value)}</span>
            <span className="font-mono text-[11px] text-zinc-500">{quarterLabel(latest.end)}</span>
          </p>
        </div>
        <div className="text-right">
          {yoy && !hideSummary ? (
            <p className={`font-mono text-xs ${yoyUp ? "text-emerald-500" : "text-red-400"}`}>
              {yoy} <span className="text-zinc-500">vs a year earlier</span>
            </p>
          ) : null}
          {series.length > 1 ? (
            <p className="mt-1.5 flex justify-end gap-3 text-[11px] text-zinc-400">
              {series.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[1px]" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-1.5 font-mono text-[10px] text-zinc-500">
              High {format(peak.value)} {quarterLabel(peak.end)} · Low {format(trough.value)} {quarterLabel(trough.end)}
            </p>
          )}
        </div>
      </figcaption>

      <div ref={ref} className="relative mt-4" style={{ height }} onMouseLeave={() => setHover(null)}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            className="block"
            role="img"
            aria-label={`${title}: ${primary.points.map((p) => `${quarterLabel(p.end)} ${format(p.value)}`).join(", ")}`}
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const i = Math.floor((e.clientX - box.left - PAD.left) / slot);
              setHover(i >= 0 && i < ends.length ? i : null);
            }}
          >
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--zinc-800))" strokeDasharray={t === 0 ? undefined : "2 3"} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-500 font-mono text-[10px]">
                  {tick(t)}
                </text>
              </g>
            ))}
            {y0 < 0 && y1 > 0 ? <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="rgb(var(--zinc-600))" /> : null}
            {reference ? (
              <g>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(reference.value)} y2={y(reference.value)} stroke="#d97706" strokeDasharray="4 3" />
                <text x={PAD.left + 6} y={y(reference.value) + 13} textAnchor="start" className="font-mono text-[10px]" style={{ fill: "#d97706" }}>
                  {reference.label}
                </text>
              </g>
            ) : null}

            {hover !== null ? <rect x={PAD.left + slot * hover} y={PAD.top} width={slot} height={plotH} fill="rgb(var(--zinc-800))" opacity={0.45} /> : null}

            {kind === "bar"
              ? series.map((s, si) =>
                  ends.map((end, i) => {
                    const v = s.points.find((p) => p.end === end)?.value;
                    if (v === undefined) return null;
                    const top = Math.min(y(v), y(0));
                    const h = Math.max(1, Math.abs(y(v) - y(0)));
                    const last = i === ends.length - 1;
                    return (
                      <rect
                        key={`${s.label}-${end}`}
                        x={x(i) - groupW / 2 + si * barW + 1}
                        y={top}
                        width={Math.max(2, barW - 2)}
                        height={h}
                        rx={1}
                        className="chart-bar"
                        style={{
                          fill: v < 0 ? NEGATIVE : s.color,
                          opacity: last || hover === i ? 1 : 0.7,
                          transformOrigin: v < 0 ? "center top" : "center bottom",
                          animationDelay: `${i * 40 + si * 20}ms`,
                        }}
                      />
                    );
                  }),
                )
              : series.map((s) => {
                  const pts = ends.map((end, i) => ({ i, v: s.points.find((p) => p.end === end)?.value })).filter((p): p is { i: number; v: number } => p.v !== undefined);
                  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ");
                  const area = `${d} L${x(pts[pts.length - 1].i)},${y(Math.max(y0, Math.min(0, y1)))} L${x(pts[0].i)},${y(Math.max(y0, Math.min(0, y1)))} Z`;
                  return (
                    <g key={s.label}>
                      <path d={area} fill={s.color} opacity={0.08} />
                      <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" pathLength={1} className="chart-line" />
                      {pts.map((p) => (
                        <rect
                          key={p.i}
                          x={x(p.i) - (hover === p.i ? 4 : 3)}
                          y={y(p.v) - (hover === p.i ? 4 : 3)}
                          width={hover === p.i ? 8 : 6}
                          height={hover === p.i ? 8 : 6}
                          rx={1}
                          style={{ fill: p.v < 0 ? NEGATIVE : s.color }}
                          stroke="rgb(var(--zinc-950))"
                          strokeWidth={1.5}
                        />
                      ))}
                    </g>
                  );
                })}

            {/* The latest figure written above its bar or point. */}
            {hover === null ? (
              <text
                x={x(ends.length - 1)}
                y={latest.value < 0 && kind === "bar" ? y(0) - 6 : y(latest.value) - 8}
                textAnchor="middle"
                className="fill-zinc-100 font-mono text-[10px] font-semibold"
              >
                {format(latest.value)}
              </text>
            ) : null}

            {ends.map((end, i) =>
              i % every === (ends.length - 1) % every ? (
                <text key={end} x={x(i)} y={height - 8} textAnchor="middle" className={`font-mono text-[10px] ${hover === i ? "fill-zinc-100" : "fill-zinc-500"}`}>
                  {quarterLabel(end)}
                </text>
              ) : null,
            )}
          </svg>
        ) : null}

        {shownEnd !== null && hover !== null ? (
          <div
            className="chart-readout pointer-events-none absolute top-0 z-10 w-[200px] rounded-xs border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"
            style={{ left: Math.min(Math.max(0, x(hover) - 100), Math.max(0, width - 200)) }}
          >
            <p className="flex justify-between font-mono text-[10px] text-zinc-500">
              <span className="text-zinc-300">{quarterLabel(shownEnd)}</span>
              <span>ended {shownEnd}</span>
            </p>
            {series.map((s) => {
              const v = s.points.find((p) => p.end === shownEnd)?.value;
              if (v === undefined) return null;
              const qoq = changeText(v, prevOf(s, shownEnd), change, format);
              const yy = changeText(v, yearBefore(s.points, shownEnd), change, format);
              return (
                <div key={s.label} className="mt-1.5">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-zinc-400">
                      <span className="h-2 w-2 rounded-[1px]" style={{ background: v < 0 ? NEGATIVE : s.color }} aria-hidden />
                      {s.label}
                    </span>
                    <span className={`font-mono text-[13px] font-semibold ${v < 0 ? "text-red-400" : "text-zinc-50"}`}>{format(v)}</span>
                  </p>
                  <p className="mt-0.5 flex justify-between font-mono text-[10px] text-zinc-500">
                    <span>q/q {qoq ?? "n/a"}</span>
                    <span>y/y {yy ?? "n/a"}</span>
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {note ? <p className="mt-2 text-[11px] leading-snug text-zinc-500">{note}</p> : null}
    </figure>
  );
}
