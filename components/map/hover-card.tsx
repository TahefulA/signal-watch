"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { HistoryResponse } from "@/app/api/history/route";
import type { CapitalStructure, CompanyProfile, DebtInstrument, Entity, Severity, Timeline } from "@/types";
import { TYPE_LABELS } from "@/lib/entity-style";
import { type FigureBar, type Materiality, SEVERITY_HEX, TYPE_HEX, compactMoney, relationText } from "@/lib/node-visuals";
import type { SeriesPoint } from "@/lib/xbrl";
import { QuarterBars } from "./quarter-bars";

export const CARD_WIDTH = 320;
const GAP = 14;

export interface HoverCardProps {
  entity: Entity;
  company: CompanyProfile;
  /** The hovered box in screen coordinates. */
  anchor: { left: number; right: number; top: number };
  capital: CapitalStructure | null;
  history: HistoryResponse | null;
  timeline: Timeline | null;
  bar: FigureBar | null;
  materiality: Materiality | null;
  severityBefore: { quarter: string; severity: Severity } | null;
  instrument: DebtInstrument | null;
}

const SEVERITY_WORD: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", none: "No" };

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{children}</p>;
}

/** The point about a year before the last, within three weeks. */
function yearAgo(points: SeriesPoint[]): SeriesPoint | null {
  const last = points.at(-1);
  if (!last) return null;
  const target = new Date(`${last.end}T00:00:00Z`).getTime() - 365 * 86_400_000;
  return points.find((p) => Math.abs(new Date(`${p.end}T00:00:00Z`).getTime() - target) < 21 * 86_400_000) ?? null;
}

function quarterName(end: string, timeline: Timeline | null): string {
  const q = timeline?.quarters.find((x) => x.periodEnd === end);
  if (q) return q.label;
  const d = new Date(`${end}T00:00:00Z`);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", " '");
}

function Chart({
  title,
  points,
  format,
  percent = false,
  timeline,
  delayMs,
}: {
  title: string;
  points: SeriesPoint[];
  format: (v: number) => string;
  percent?: boolean;
  timeline: Timeline | null;
  delayMs: number;
}) {
  const shown = points.slice(-8);
  const last = shown.at(-1);
  if (!last || shown.length < 2) return null;
  const before = yearAgo(points);
  const change =
    before === null
      ? null
      : percent
        ? `${last.value - before.value >= 0 ? "+" : ""}${(last.value - before.value).toFixed(1)} pts`
        : before.value > 0
          ? `${last.value >= before.value ? "+" : ""}${(((last.value - before.value) / before.value) * 100).toFixed(1)}%`
          : null;
  const up = before !== null && last.value >= before.value;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">{title}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-base font-semibold leading-none text-zinc-900">{format(last.value)}</span>
          {change ? <span className={`font-mono text-[10px] ${up ? "text-emerald-700" : "text-red-600"}`}>{change} y/y</span> : null}
        </span>
      </div>
      <div className="mt-1.5">
        <QuarterBars points={shown} color={TYPE_HEX.company} height={34} format={format} label={title} delayMs={delayMs} />
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-zinc-400">
        <span>{quarterName(shown[0].end, timeline)}</span>
        <span>{quarterName(last.end, timeline)}</span>
      </div>
    </div>
  );
}

function CompanyBody({ capital, history, timeline }: { capital: CapitalStructure | null; history: HistoryResponse | null; timeline: Timeline | null }) {
  const metric = (key: string) => capital?.metrics.find((m) => m.key === key);
  const ratios = ["total_debt", "debt_to_ebitda", "interest_coverage", "liquidity"].map(metric).filter((m) => m !== undefined);
  const pct = (v: number) => `${v.toFixed(1)}%`;
  return (
    <>
      {history ? (
        <div className="space-y-3">
          <Chart title="Revenue" points={history.revenue} format={compactMoney} timeline={timeline} delayMs={0} />
          <Chart title="EBITDA margin" points={history.ebitdaMargin} format={pct} percent timeline={timeline} delayMs={80} />
          <Chart title="Cash" points={history.cash} format={compactMoney} timeline={timeline} delayMs={160} />
        </div>
      ) : (
        <p className="font-mono text-[11px] text-zinc-500">{capital ? "Loading quarterly figures..." : "Quarterly figures are not available for this report."}</p>
      )}
      {ratios.length ? (
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xs border border-zinc-200 bg-zinc-200">
          {ratios.map((m) => (
            <div key={m.key} className="bg-white px-2.5 py-2" title={m.note}>
              <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-500">{m.label}</p>
              <p className={`mt-0.5 font-mono text-[13px] font-semibold ${/^n\/m|Not/.test(m.display) ? "text-zinc-400" : "text-zinc-900"}`}>{m.display}</p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 font-mono text-[9px] text-zinc-400">
        Quarterly XBRL figures{capital?.asOf ? ` through ${capital.asOf}` : ""} · open the Financial tab for more
      </p>
    </>
  );
}

function EntityBody({
  entity,
  timeline,
  bar,
  materiality,
  severityBefore,
  instrument,
}: Pick<HoverCardProps, "entity" | "timeline" | "bar" | "materiality" | "severityBefore" | "instrument">) {
  const color = TYPE_HEX[entity.type];
  const figure = bar?.figure.text ?? entity.magnitude?.label ?? null;
  const quarters = timeline?.quarters.slice(-12) ?? [];
  const flags = timeline?.presence[entity.id]?.slice(-12) ?? null;
  const named = flags ? flags.filter(Boolean).length : 0;
  const first = flags ? flags.findIndex(Boolean) : -1;
  return (
    <>
      {figure ? (
        <div>
          <Label>{entity.magnitude?.label && bar ? entity.magnitude.label : "Figure in the filing"}</Label>
          <p className="font-display text-[26px] font-semibold leading-none tracking-[-0.01em] text-zinc-900">{figure}</p>
          {bar || materiality ? (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-xs bg-zinc-200">
                <div
                  className="bar-fill h-full rounded-xs"
                  style={{ width: `${Math.max(2, Math.min(100, materiality ? materiality.percent : (bar?.fill ?? 0) * 100))}%`, background: color }}
                />
              </div>
              <p className="mt-1 text-[10px] leading-snug text-zinc-500">{materiality?.basis ?? bar?.basis}</p>
            </>
          ) : null}
        </div>
      ) : entity.relationType === "CUSTOMER_OF" ? (
        <p className="rounded-xs border border-dashed border-zinc-300 px-2 py-1.5 text-[11px] text-zinc-500">Revenue share is not disclosed in the filings read.</p>
      ) : null}

      {instrument ? (
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xs border border-zinc-200 bg-zinc-200">
          {[
            [
              "Outstanding",
              instrument.outstanding !== null
                ? compactMoney(instrument.outstanding)
                : instrument.commitment !== null
                  ? `${compactMoney(instrument.commitment)} committed`
                  : "Not disclosed",
            ],
            ["Matures", instrument.maturity ?? "Not disclosed"],
            ["Rate", instrument.coupon ?? "Not disclosed"],
            ["Ranking", instrument.seniority.replace(/_/g, " ")],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-2.5 py-1.5">
              <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-500">{k}</p>
              <p className="truncate font-mono text-[12px] font-medium text-zinc-900">{v}</p>
            </div>
          ))}
        </div>
      ) : null}

      {flags && quarters.length ? (
        <div className="mt-4">
          <Label>Named in the filings, quarter by quarter</Label>
          <div className="flex gap-[3px]">
            {quarters.map((q, i) => (
              <span
                key={q.label}
                title={`${q.label}: ${flags[i] ? "named" : "not named"} in the ${q.form} filed ${q.filed}`}
                className="quarter-cell h-4 flex-1 rounded-[1px]"
                style={{ background: flags[i] ? color : "#e4e4e7", animationDelay: `${i * 25}ms` }}
              />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between font-mono text-[9px] text-zinc-400">
            <span>{quarters[0].label}</span>
            <span>{quarters.at(-1)?.label}</span>
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">
            {named ? `Named in ${named} of ${quarters.length} filings · first in ${quarters[first].label}` : `Not named in these ${quarters.length} filings; from news or a later filing`}
          </p>
        </div>
      ) : null}

      {severityBefore ? (
        <p className="mt-3 text-[11px] text-zinc-600">
          Severity {severityBefore.quarter}: <span className="font-medium">{SEVERITY_WORD[severityBefore.severity]}</span> &rarr; now:{" "}
          <span className="font-medium" style={{ color: SEVERITY_HEX[entity.severity] === "#d4d4d8" ? "#71717a" : SEVERITY_HEX[entity.severity] }}>
            {SEVERITY_WORD[entity.severity]}
          </span>
        </p>
      ) : null}

      {entity.strategic?.whyItMatters ? <p className="mt-3 line-clamp-2 text-[11px] leading-snug text-zinc-700">{entity.strategic.whyItMatters}</p> : null}

      <blockquote className="mt-3 border-l-2 pl-2.5" style={{ borderColor: color }}>
        <p className="line-clamp-3 text-[11px] italic leading-snug text-zinc-600">&ldquo;{entity.sourceQuote}&rdquo;</p>
        <p className="mt-1 font-mono text-[9px] text-zinc-400">
          {entity.sourceType === "News" ? `${entity.sourceLabel}, ${entity.sourceDate}` : `${entity.sourceType} ${entity.fiscalPeriod ?? ""} filed ${entity.sourceDate}`}
          {entity.sourcePage ? ` · p.${entity.sourcePage}` : ""}
        </p>
      </blockquote>
    </>
  );
}

/** Beside the hovered box: its numbers as charts. Fixed to the screen so it reads at any zoom. */
export function HoverCard(props: HoverCardProps) {
  const { entity, company, anchor } = props;
  const color = entity.isCentral ? TYPE_HEX.company : TYPE_HEX[entity.type];
  const fitsRight = anchor.right + GAP + CARD_WIDTH <= window.innerWidth - 8;
  const left = fitsRight ? anchor.right + GAP : Math.max(8, anchor.left - GAP - CARD_WIDTH);
  // Measured after the first render, so a tall card moves up to stay on screen.
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => setHeight(ref.current?.offsetHeight ?? 0), []);
  const top = Math.max(56, Math.min(anchor.top, window.innerHeight - height - 8));
  return (
    <div
      ref={ref}
      className={`map-card hover-card pointer-events-none fixed z-50 rounded-xs border border-zinc-300 bg-white p-4 ${fitsRight ? "" : "hover-card-left"}`}
      style={{ left, top, width: CARD_WIDTH, borderTop: `3px solid ${color}` }}
      role="tooltip"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ background: color }} aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color }}>
            {entity.isCentral ? `${company.ticker} · Subject company` : TYPE_LABELS[entity.type]}
          </span>
        </span>
        {!entity.isCentral ? (
          <span
            className="rounded-xs px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
            style={{
              background: entity.severity === "none" ? "#f4f4f5" : SEVERITY_HEX[entity.severity],
              color: entity.severity === "none" ? "#71717a" : "#ffffff",
            }}
          >
            {SEVERITY_WORD[entity.severity]} severity
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-[15px] font-semibold leading-tight text-zinc-900">{entity.name}</p>
      {!entity.isCentral ? <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-600">{relationText(entity)}</p> : null}
      <div className="mt-3 border-t border-zinc-200 pt-3">
        {entity.isCentral ? <CompanyBody capital={props.capital} history={props.history} timeline={props.timeline} /> : <EntityBody {...props} />}
      </div>
    </div>
  );
}
