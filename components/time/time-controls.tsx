"use client";

import { useEffect, useRef, useState } from "react";
import type { TimelineQuarter } from "@/types";
import type { MarketContextRow } from "@/app/api/market-context/route";
import { RANGE_OPTIONS, type TimeRange, describeWindow, quarterStart } from "@/lib/time-range";

/** The window selector beside the filter chips. */
export function RangeSelect({ range, quarters, onChange }: { range: TimeRange; quarters: TimelineQuarter[]; onChange: (r: TimeRange) => void }) {
  return (
    <label className="inline-flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
      <span className="sr-only">Time range</span>
      <select
        value={range.kind}
        onChange={(e) => {
          const kind = e.target.value as TimeRange["kind"];
          if (kind === "custom" && quarters.length) {
            onChange({ kind, start: quarters[Math.max(0, quarters.length - 4)].label, end: quarters[quarters.length - 1].label });
          } else onChange({ kind });
        }}
        className="h-7 rounded-xs border border-zinc-800 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-200 focus:border-zinc-600 focus:outline-none"
      >
        {RANGE_OPTIONS.map((o) => (
          <option key={o.kind} value={o.kind}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The quarters the filings cover, with the window marked. Drag either end to
 * resize the window; click a quarter to look at it alone.
 */
export function TimeContextBar({
  quarters,
  window: w,
  onChange,
}: {
  quarters: TimelineQuarter[];
  window: { start: number; end: number };
  onChange: (r: TimeRange) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<"start" | "end" | null>(null);
  const n = quarters.length;
  const at = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || n < 1) return;
      const i = Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * (n - 1));
      const start = drag === "start" ? Math.min(i, w.end) : w.start;
      const end = drag === "end" ? Math.max(i, w.start) : w.end;
      onChange({ kind: "custom", start: quarters[start].label, end: quarters[end].label });
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, n, w.start, w.end, quarters, onChange]);

  if (n === 0) return null;
  return (
    <div className="px-6 pb-2 pt-3">
      <div ref={trackRef} className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-800" aria-hidden />
        <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-zinc-400" style={{ left: `${at(w.start)}%`, width: `${at(w.end) - at(w.start)}%` }} aria-hidden />
        {quarters.map((q, i) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onChange({ kind: "custom", start: q.label, end: q.label })}
            title={`${q.label}: ${q.form} filed ${q.filed}`}
            className={`absolute top-1/2 h-2 w-px -translate-y-1/2 ${i >= w.start && i <= w.end ? "bg-zinc-300" : "bg-zinc-700"}`}
            style={{ left: `${at(i)}%` }}
            aria-label={`Show ${q.label} only`}
          >
            <span className="absolute -inset-x-2 -inset-y-1" />
          </button>
        ))}
        {(["start", "end"] as const).map((end) => (
          <span
            key={end}
            role="slider"
            aria-label={end === "start" ? "Window start" : "Window end"}
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={end === "start" ? w.start : w.end}
            aria-valuetext={quarters[end === "start" ? w.start : w.end].label}
            tabIndex={0}
            onPointerDown={(e) => {
              e.preventDefault();
              setDrag(end);
            }}
            onKeyDown={(e) => {
              const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
              if (!delta) return;
              const start = end === "start" ? Math.min(Math.max(0, w.start + delta), w.end) : w.start;
              const stop = end === "end" ? Math.max(Math.min(n - 1, w.end + delta), w.start) : w.end;
              onChange({ kind: "custom", start: quarters[start].label, end: quarters[stop].label });
            }}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-zinc-950 bg-zinc-100 focus:outline focus:outline-1 focus:outline-zinc-400"
            style={{ left: `${at(end === "start" ? w.start : w.end)}%`, zIndex: end === "end" ? 2 : 1 }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-3.5">
        {quarters.map((q, i) =>
          (n - 1 - i) % 2 === 0 ? (
            <span key={q.label} className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-zinc-500" style={{ left: `${at(i)}%` }}>
              {q.label}
            </span>
          ) : null,
        )}
      </div>
      <p className="mt-1 font-mono text-[11px] text-zinc-400">
        Showing: {describeWindow(quarters, w)}
        <span className="text-zinc-600"> · bars on each box mark the quarters whose 10-Q or 10-K names it</span>
      </p>
    </div>
  );
}

function pct(a: number, b: number): string {
  const p = ((b - a) / a) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

/** Rates and prices over the same window, from Yahoo Finance. No bond prices: there is no bond feed. */
export function MarketContextStrip({ ticker, quarters, window: w }: { ticker: string; quarters: TimelineQuarter[]; window: { start: number; end: number } }) {
  const [rows, setRows] = useState<MarketContextRow[] | null>(null);
  const start = w.end >= 0 ? quarterStart(quarters[w.start].periodEnd) : null;
  const isLatest = w.end === quarters.length - 1;
  const end = w.end >= 0 ? (isLatest ? new Date().toISOString().slice(0, 10) : quarters[w.end].periodEnd) : null;

  useEffect(() => {
    if (!start || !end) return;
    let live = true;
    setRows(null);
    fetch(`/api/market-context?ticker=${encodeURIComponent(ticker)}&start=${start}&end=${end}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: MarketContextRow[] }>) : null))
      .then((body) => live && setRows(body?.rows ?? []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [ticker, start, end]);

  if (!start || !end) return null;
  return (
    <div className="flex items-center gap-x-5 overflow-x-auto whitespace-nowrap border-t border-zinc-800 px-6 py-1.5 font-mono text-[11px]">
      <span className="text-zinc-500">
        MARKET {start} → {rows?.find((r) => r.end)?.end?.date ?? end}
      </span>
      {rows === null ? <span className="text-zinc-600">Loading...</span> : null}
      {rows?.map((r) => {
        if (!r.start || !r.end) return <span key={r.symbol} className="text-zinc-600">{r.label}: n/a</span>;
        const up = r.end.value >= r.start.value;
        const change = r.unit === "%" ? `${up ? "+" : ""}${(r.end.value - r.start.value).toFixed(2)}pt` : pct(r.start.value, r.end.value);
        const fmt = (v: number) => (r.unit === "%" ? `${v.toFixed(2)}%` : `$${v.toFixed(2)}`);
        return (
          <span key={r.symbol} title={`${r.label}: ${fmt(r.start.value)} on ${r.start.date}, ${fmt(r.end.value)} on ${r.end.date}`}>
            <span className="text-zinc-500">{r.label} </span>
            <span className="text-zinc-100">{fmt(r.end.value)}</span>{" "}
            <span className={up ? "text-emerald-500" : "text-red-500"}>
              {up ? "▲" : "▼"} {change}
            </span>
          </span>
        );
      })}
      <span className="text-zinc-600">Bond spread, price: no bond price feed</span>
    </div>
  );
}
