"use client";

import { useState } from "react";
import type { LmeEventKind } from "@/types";
import { KIND_MARK, KIND_SHORT, month } from "./language";

export interface TimelineMark {
  id: string;
  date: string;
  kind: LmeEventKind;
  /** "Container Store: Chapter 11" on hover. */
  title: string;
  quote?: string;
  url: string;
}

export interface TimelineRow {
  id: string;
  label: string;
  sub?: string;
  /** Where the row's line ends: the last filing of a company that stopped filing. Null runs to today. */
  end?: string | null;
  /** The company stopped filing; its line is dotted. */
  ended?: boolean;
  /** Where the line starts, when known. */
  start?: string | null;
  marks: TimelineMark[];
  highlight?: boolean;
  /** A tag at today's end of the row: "3 on watch". */
  tag?: { text: string; tone: "red" | "amber" | "zinc" };
}

const TAG_TONE = { red: "border-red-700 text-red-400", amber: "border-amber-600 text-amber-400", zinc: "border-zinc-700 text-zinc-400" } as const;

function Mark({ kind, size = 12 }: { kind: LmeEventKind; size?: number }) {
  const m = KIND_MARK[kind];
  const half = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="block overflow-visible">
      {m.shape === "diamond" ? (
        <rect x={half - half * 0.72} y={half - half * 0.72} width={size * 0.72} height={size * 0.72} transform={`rotate(45 ${half} ${half})`} fill={m.color} stroke="rgb(var(--zinc-950))" strokeWidth={2} />
      ) : m.shape === "square" ? (
        <rect x={1} y={1} width={size - 2} height={size - 2} rx={1} fill={m.color} stroke="rgb(var(--zinc-950))" strokeWidth={2} />
      ) : (
        <circle cx={half} cy={half} r={half - 0.5} fill={m.color} stroke="rgb(var(--zinc-950))" strokeWidth={2} />
      )}
    </svg>
  );
}

export function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
      {(["lme", "restructuring", "bankruptcy"] as LmeEventKind[]).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <Mark kind={k} size={10} /> {KIND_SHORT[k]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="w-5 border-t border-zinc-500" aria-hidden /> Files with the SEC
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-5 border-t border-dotted border-zinc-600" aria-hidden /> Stopped filing
      </span>
    </div>
  );
}

/** Hover card under the mark, kept inside the track at either end. */
function Tip({ mark, at }: { mark: TimelineMark; at: number }) {
  const shift = at > 70 ? "-translate-x-full" : at < 30 ? "" : "-translate-x-1/2";
  return (
    <span className={`pointer-events-none absolute top-full z-20 mt-1 block w-72 rounded-xs border border-zinc-700 bg-zinc-950 p-2.5 text-[11.5px] leading-snug shadow-lg ${shift}`} style={{ left: `${at}%` }}>
      <span className="flex items-center gap-1.5 font-semibold text-zinc-50">
        <Mark kind={mark.kind} size={10} /> {mark.title}
      </span>
      <span className="block font-mono text-[10px] text-zinc-500">{month(mark.date)} · 8-K · click to open</span>
      {mark.quote ? <span className="mt-1 line-clamp-4 block text-zinc-300">&ldquo;{mark.quote}&rdquo;</span> : null}
    </span>
  );
}

/**
 * Years across, one row per company or sponsor, a mark on the date of every
 * bankruptcy and lender squeeze. The point of the view: the same owners come
 * back to the same move.
 */
export function PlaybookTimeline({
  rows,
  from = "2016-01-01",
  today,
  onRow,
  labelWidth = 200,
}: {
  rows: TimelineRow[];
  from?: string;
  today: string;
  onRow?: (id: string) => void;
  labelWidth?: number;
}) {
  const [hover, setHover] = useState<{ mark: TimelineMark; x: number; row: number } | null>(null);
  const t0 = Date.parse(from);
  const span = Date.parse(today) - t0;
  const x = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso.slice(0, 10)) - t0) / span) * 100));
  const years: number[] = [];
  for (let y = Number(from.slice(0, 4)) + 1; y <= Number(today.slice(0, 4)); y++) years.push(y);

  return (
    <div className="relative">
      <div className="grid" style={{ gridTemplateColumns: `minmax(110px, ${labelWidth}px) minmax(0, 1fr) 84px` }}>
        <div />
        <div className="relative h-5 text-[10px] text-zinc-500">
          {/* A year too close to today would sit under its label. */}
          {years.filter((y) => x(`${y}-01-01`) < 93).map((y) => (
            <span key={y} className={`absolute -translate-x-1/2 font-mono ${y % 2 ? "hidden sm:block" : ""}`} style={{ left: `${x(`${y}-01-01`)}%` }}>
              {y}
            </span>
          ))}
          <span className="absolute -translate-x-full pr-1 font-mono font-semibold text-zinc-300" style={{ left: "100%" }}>
            Today
          </span>
        </div>
        <div />
        {rows.map((r, i) => {
          const end = r.end ? x(r.end) : 100;
          const start = r.start ? x(r.start) : 0;
          return (
            <div
              key={r.id}
              // A div, not a button: the row holds links to the filings.
              role={onRow ? "button" : undefined}
              tabIndex={onRow ? 0 : undefined}
              onClick={onRow ? () => onRow(r.id) : undefined}
              onKeyDown={onRow ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRow(r.id)) : undefined}
              className={`group col-span-3 grid items-center border-t border-zinc-800/70 text-left ${r.highlight ? "bg-zinc-900" : onRow ? "cursor-pointer hover:bg-zinc-900/60" : ""} outline-none focus-visible:ring-1 focus-visible:ring-zinc-500`}
              style={{ gridTemplateColumns: `minmax(110px, ${labelWidth}px) minmax(0, 1fr) 84px` }}
            >
              <span className="min-w-0 py-2 pr-3">
                <span className={`block truncate text-[12.5px] ${r.highlight ? "font-semibold text-zinc-50" : "text-zinc-200"}`}>
                  {r.highlight ? <span className="mr-1 text-red-500" aria-hidden>&#9656;</span> : null}
                  {r.label}
                </span>
                {r.sub ? <span className="block truncate text-[10.5px] text-zinc-500">{r.sub}</span> : null}
              </span>
              <span className="relative block h-8">
                {years.map((y) => (
                  <span key={y} className="absolute inset-y-0 border-l border-zinc-800/50" style={{ left: `${x(`${y}-01-01`)}%` }} aria-hidden />
                ))}
                <span className="absolute inset-y-0 right-0 border-l border-dashed border-zinc-500" aria-hidden />
                <span
                  className={`absolute top-1/2 border-t ${r.ended || r.end ? "border-dotted border-zinc-600" : r.highlight ? "border-zinc-300" : "border-zinc-500"}`}
                  style={{ left: `${start}%`, width: `${Math.max(0, end - start)}%` }}
                  aria-hidden
                />
                {r.marks.map((m) => (
                  <a
                    key={m.id}
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    onMouseEnter={() => setHover({ mark: m, x: x(m.date), row: i })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ mark: m, x: x(m.date), row: i })}
                    onBlur={() => setHover(null)}
                    className="absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                    style={{ left: `${x(m.date)}%` }}
                    aria-label={`${m.title}, ${month(m.date)}`}
                  >
                    <Mark kind={m.kind} size={m.kind === "lme" ? 13 : 11} />
                  </a>
                ))}
                {hover && hover.row === i ? <Tip mark={hover.mark} at={hover.x} /> : null}
              </span>
              <span className="pl-2 text-right">
                {r.tag ? <span className={`inline-block whitespace-nowrap rounded-xs border px-1.5 py-0.5 text-[10px] font-semibold ${TAG_TONE[r.tag.tone]}`}>{r.tag.text}</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
