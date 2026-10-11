"use client";

import { Check, FileText, HelpCircle, Newspaper, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CapitalStructure, DevilsAdvocate, Entity, EntityGraph, EntityType, Timeline } from "@/types";
import { DevilsAdvocateToggle } from "@/components/graph/devils-advocate-toggle";
import { concernCount, flaggedIds } from "@/lib/counter-view";
import { ENTITY_TYPES, SEVERITIES } from "@/types/entity";
import { EntityMap, type MapFilters } from "@/components/map/entity-map";
import { TYPE_LABELS } from "@/lib/entity-style";
import { CONFIDENCE_DOTS, SEVERITY_DOTS, SEVERITY_HEX, TYPE_HEX } from "@/lib/node-visuals";
import { type TimeRange, windowOf } from "@/lib/time-range";
import { MarketContextStrip, RangeSelect, TimeContextBar } from "@/components/time/time-controls";

interface GraphTabProps {
  graph: EntityGraph;
  totalDebt: string | null;
  notes: string[];
  selectedId: string | null;
  focusRequest: number;
  onSelect: (entity: Entity) => void;
  onClearSelection: () => void;
  timeline: Timeline | null;
  timelineError: string | null;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  /** "As of Q2 2026 · 10-Q filed 2026-08-05". */
  asOf: string | null;
  devil: DevilsAdvocate | null | undefined;
  devilBusy: boolean;
  /** The debt note and ratios, for the hover cards and debt due dates on the map. */
  capital?: CapitalStructure | null;
}

function Dots({ filled, color, size = 6 }: { filled: number; color: string; size?: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size / 2 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="rounded-full" style={{ width: size, height: size, background: i < filled ? color : "transparent", border: i < filled ? "none" : `1px solid ${color}` }} />
      ))}
    </span>
  );
}

function LegendSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs font-medium text-zinc-400">{children}</div>
    </div>
  );
}

const SEVERITY_WORD = { high: "High", medium: "Medium", low: "Low", none: "None" } as const;

/** The legend, behind a button in the canvas corner. */
function LegendPopover({ highConfidenceOnly, onToggleConfidence }: { highConfidenceOnly: boolean; onToggleConfidence: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="absolute bottom-4 right-4 z-10">
      {open ? (
        <div className="absolute bottom-10 right-0 w-[280px] space-y-4 rounded-xs border border-zinc-800 bg-zinc-900/95 p-4 backdrop-blur-[8px]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-300">Legend</p>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-100" aria-label="Close legend">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <LegendSection title="Border">
            {ENTITY_TYPES.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs" style={{ background: TYPE_HEX[t] }} />
                {TYPE_LABELS[t]}
              </span>
            ))}
          </LegendSection>
          <LegendSection title="Severity (dots and left strip)">
            {SEVERITIES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <Dots filled={SEVERITY_DOTS[s]} color={s === "none" ? "#a1a1aa" : SEVERITY_HEX[s]} />
                {SEVERITY_WORD[s]}
              </span>
            ))}
          </LegendSection>
          <LegendSection title="Confidence (bottom right)">
            {(["high", "medium", "low"] as const).map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <Dots filled={CONFIDENCE_DOTS[c]} color="#059669" size={5} />
                {SEVERITY_WORD[c]}
              </span>
            ))}
          </LegendSection>
          <LegendSection title="Trend">
            <span>{"▲"} Up</span>
            <span>{"▼"} Down</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-px w-2.5 bg-zinc-400" /> Flat
            </span>
          </LegendSection>
          <LegendSection title="Source and status">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Filing
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Newspaper className="h-3 w-3" /> News
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-600" /> New
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-600" /> Changed
            </span>
          </LegendSection>
          <p className="text-[11px] leading-snug text-zinc-500">
            Bar: the box&rsquo;s figure against the largest of its unit on the map, or its disclosed share. Bottom line: share of revenue or of total debt.
          </p>
          <label className="flex cursor-pointer items-center gap-2 border-t border-zinc-800 pt-3 text-xs font-medium text-zinc-300">
            <input type="checkbox" checked={highConfidenceOnly} onChange={(e) => onToggleConfidence(e.target.checked)} className="h-3.5 w-3.5 accent-zinc-300" />
            Show only high confidence
          </label>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Legend"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

/** The hero view: type filter chips, then the map filling the rest of the screen. */
export function GraphTab({
  graph,
  totalDebt,
  notes,
  selectedId,
  focusRequest,
  onSelect,
  onClearSelection,
  timeline,
  timelineError,
  range,
  onRangeChange,
  asOf,
  devil,
  devilBusy,
  capital = null,
}: GraphTabProps) {
  const [counter, setCounter] = useState(false);
  const counterIds = useMemo(() => (counter && devil ? flaggedIds(devil) : null), [counter, devil]);
  const win = timeline ? windowOf(timeline.quarters, range) : null;
  const [hidden, setHidden] = useState<EntityType[]>([]);
  const [highConfidenceOnly, setHighConfidenceOnly] = useState(false);
  const counts = new Map(ENTITY_TYPES.map((t) => [t, graph.nodes.filter((n) => !n.isCentral && n.type === t).length]));
  const filters: MapFilters = {
    types: hidden.length ? ENTITY_TYPES.filter((t) => !hidden.includes(t)) : [],
    severities: [],
    highConfidenceOnly,
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-zinc-800 px-4">
        {ENTITY_TYPES.map((t) => {
          const on = !hidden.includes(t);
          const n = counts.get(t) ?? 0;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setHidden((h) => (h.includes(t) ? h.filter((x) => x !== t) : [...h, t]))}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-150 ease-out ${
                on ? "border-zinc-800 bg-zinc-900 text-zinc-200" : "border-zinc-700 bg-zinc-950 text-zinc-500"
              }`}
            >
              <span className="h-2 w-2 rounded-xs" style={{ background: TYPE_HEX[t], opacity: on ? 1 : 0.4 }} aria-hidden />
              {TYPE_LABELS[t]}
              <span className="font-mono text-zinc-500">{n}</span>
              {on ? <Check className="h-3 w-3 text-zinc-400" aria-hidden /> : null}
            </button>
          );
        })}
        {hidden.length || highConfidenceOnly ? (
          <button
            type="button"
            onClick={() => {
              setHidden([]);
              setHighConfidenceOnly(false);
            }}
            className="ml-2 shrink-0 text-[11px] text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200"
          >
            Reset
          </button>
        ) : null}
        {notes.length ? <span className="shrink-0 pl-4 text-[11px] text-amber-500">{notes[0]}</span> : null}
        <div className="ml-auto flex shrink-0 items-center gap-3 pl-4">
          {asOf ? <span className="hidden font-mono text-[11px] text-zinc-500 lg:inline">{asOf}</span> : null}
          <RangeSelect range={range} quarters={timeline?.quarters ?? []} onChange={onRangeChange} />
          <span data-tour="counter" className="inline-flex">
          <DevilsAdvocateToggle enabled={counter && Boolean(devil)} onToggle={setCounter} concernCount={concernCount(devil)} disabled={!devil || devilBusy} />
          </span>
        </div>
      </div>
      {/* Fixed height, so the map is sized once and does not jump when the timeline arrives. */}
      <div data-tour="time" className="h-[104px] shrink-0 overflow-hidden border-b border-zinc-800">
        {timeline && win ? (
          <>
            <TimeContextBar quarters={timeline.quarters} window={win} onChange={onRangeChange} />
            <MarketContextStrip ticker={graph.company.ticker} quarters={timeline.quarters} window={win} />
          </>
        ) : (
          <p className="px-6 py-3 font-mono text-[11px] text-zinc-500">
            {timelineError ?? "Reading the last twelve 10-Q and 10-K filings for the timeline. The first time takes up to a minute; after that it is saved with the report."}
          </p>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <EntityMap
          graph={graph}
          filters={filters}
          totalDebt={totalDebt}
          selectedId={selectedId}
          focusRequest={focusRequest}
          onSelect={onSelect}
          onClearSelection={onClearSelection}
          time={timeline && win ? { timeline, window: win } : null}
          counterIds={counterIds}
          capital={capital}
        />
        <LegendPopover highConfidenceOnly={highConfidenceOnly} onToggleConfidence={setHighConfidenceOnly} />
      </div>
    </div>
  );
}
