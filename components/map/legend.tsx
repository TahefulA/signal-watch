import { FileText, Newspaper, X } from "lucide-react";
import type { ReactNode } from "react";
import { ENTITY_TYPES, type EntityType, SEVERITIES, type Severity } from "@/types/entity";
import { TYPE_LABELS } from "@/lib/entity-style";
import { SEVERITY_DOTS, SEVERITY_HEX, TYPE_HEX } from "@/lib/node-visuals";
import type { MapFilters } from "./entity-map";

interface LegendProps {
  filters: MapFilters;
  onChange: (filters: MapFilters) => void;
}

const SEVERITY_WORD: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", none: "None" };

function Dots({ filled, color, size = 6 }: { filled: number; color: string; size?: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size / 2 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full"
          style={{ width: size, height: size, background: i < filled ? color : "transparent", border: i < filled ? "none" : `1px solid ${color}` }}
        />
      ))}
    </span>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-600">{title}</span>
      {children}
    </div>
  );
}

function FilterItem({ active, onClick, swatch, label }: { active: boolean; onClick: () => void; swatch: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`legend-item inline-flex items-center gap-1.5 rounded-xs text-xs font-medium transition-colors duration-[120ms] ease-out ${active ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
    >
      {swatch}
      {label}
      {active ? <X size={10} className="text-zinc-400" aria-label="Clear filter" /> : null}
    </button>
  );
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Map key. Clicking a type or severity fades every other box to 15%; filters stack. */
export function Legend({ filters, onChange }: LegendProps) {
  const anyFilter = filters.types.length > 0 || filters.severities.length > 0 || filters.highConfidenceOnly;
  return (
    <div className="flex flex-col gap-2.5 rounded-xs border border-zinc-800 bg-zinc-900/80 px-4 py-3 backdrop-blur-[8px]">
      <Row title="Border">
        {ENTITY_TYPES.map((type: EntityType) => {
          const active = filters.types.includes(type);
          return (
            <FilterItem
              key={type}
              active={active}
              onClick={() => onChange({ ...filters, types: toggle(filters.types, type) })}
              label={TYPE_LABELS[type]}
              swatch={
                <span
                  className="legend-swatch h-3 w-3 rounded-xs"
                  style={{ background: TYPE_HEX[type], outline: active ? `1px solid ${TYPE_HEX[type]}` : undefined, outlineOffset: 1 }}
                />
              }
            />
          );
        })}
      </Row>
      <Row title="Severity">
        {SEVERITIES.map((severity) => {
          const active = filters.severities.includes(severity);
          return (
            <FilterItem
              key={severity}
              active={active}
              onClick={() => onChange({ ...filters, severities: toggle(filters.severities, severity) })}
              label={SEVERITY_WORD[severity]}
              swatch={<Dots filled={SEVERITY_DOTS[severity]} color={severity === "none" ? "#a1a1aa" : SEVERITY_HEX[severity]} />}
            />
          );
        })}
        <span className="text-[11px] text-zinc-600">also the left strip</span>
      </Row>
      <Row title="Status">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden /> New
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-amber-600" aria-hidden /> Changed
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <Dots filled={3} color="#059669" size={5} /> High
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <Dots filled={2} color="#059669" size={5} /> Medium
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <Dots filled={1} color="#059669" size={5} /> Low confidence
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <span className="text-[10px]" aria-hidden>
            {"▲"}
          </span>
          Up
          <span className="text-[10px]" aria-hidden>
            {"▼"}
          </span>
          Down
          <span className="inline-block h-px w-2.5 bg-zinc-400" aria-hidden />
          Flat
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <FileText size={12} aria-hidden /> Filing
          <Newspaper size={12} aria-hidden /> News
        </span>
      </Row>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-24 text-xs">
        <span className="inline-flex items-center gap-1.5 text-zinc-500">
          <span className="inline-block h-1 w-8 rounded-xs bg-zinc-600" aria-hidden />
          Bar: the box&rsquo;s figure against the largest of its kind on the map, or its disclosed share
        </span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-zinc-300">
          <input
            type="checkbox"
            checked={filters.highConfidenceOnly}
            onChange={(e) => onChange({ ...filters, highConfidenceOnly: e.target.checked })}
            className="h-3.5 w-3.5 accent-zinc-300"
          />
          Show only high confidence
        </label>
        {anyFilter ? (
          <button
            type="button"
            onClick={() => onChange({ types: [], severities: [], highConfidenceOnly: false })}
            className="text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100"
          >
            Clear all filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
