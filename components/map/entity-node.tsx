"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Building2,
  DollarSign,
  FileText,
  Link,
  Newspaper,
  Scale,
  Shield,
  Sword,
} from "lucide-react";
import { type CSSProperties, memo } from "react";
import type { CompanyProfile, Confidence, Entity, Severity, Trend } from "@/types";
import type { SeriesPoint } from "@/lib/xbrl";
import { QuarterBars } from "./quarter-bars";
import { TYPE_LABELS } from "@/lib/entity-style";
import {
  CONFIDENCE_DOTS,
  type FigureBar,
  type Materiality,
  type RelationIcon,
  SEVERITY_DOTS,
  SEVERITY_HEX,
  TYPE_HEX,
  TYPE_HEX_DARK,
  TYPE_TINT,
  compactMoney,
  relationIcon,
  relationText,
} from "@/lib/node-visuals";

export type Side = "left" | "right" | "top" | "bottom";

export interface EntityNodeData extends Record<string, unknown> {
  entity: Entity;
  totalDebt?: string | null;
  company?: CompanyProfile | null;
  /** Bar under the figure, when the figure can be compared. */
  bar?: FigureBar | null;
  materiality?: Materiality | null;
  width?: number;
  /** 1 normally; lower when a filter or focus fades the box. */
  opacity?: number;
  /** Highlighted as the hovered or selected box, or as a box connected to it. */
  emphasis?: "focus" | "related" | null;
  /** Position in the entrance sequence. */
  order?: number;
  /** Spokes leaving the subject company on each side, so lines fan out along its edge. */
  fan?: Partial<Record<Side, number>>;
  /** Quarters in the selected window and whether that quarter's 10-Q or 10-K names the entity. */
  time?: { segments: { label: string; present: boolean }[]; later: string | null } | null;
  /** Gemini's severity on the previous quarter's map, for the trend arrow. */
  severityBefore?: { quarter: string; severity: Severity } | null;
  /** Counter view: the company box and the boxes the Devil's Advocate flags turn red. */
  counter?: "central" | "flagged" | null;
  /** The company box: revenue for the last eight quarters, from XBRL. */
  revenue?: SeriesPoint[] | null;
}

export type EntityFlowNode = Node<EntityNodeData, "entityNode">;

const RELATION_ICON: Record<RelationIcon, typeof ArrowRight> = {
  out: ArrowRight,
  in: ArrowLeft,
  both: ArrowLeftRight,
  shield: Shield,
  scale: Scale,
  owns: Building2,
  impact: AlertTriangle,
  dollar: DollarSign,
  link: Link,
};

const SEVERITY_WORD: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", none: "None" };

const TREND_WORD: Record<Exclude<Trend, "unknown">, string> = { increasing: "Up", decreasing: "Down", stable: "Flat" };

/**
 * Load sequence, played once: the company box scales in (0-200ms), one ring
 * spreads from it (200-600ms), then the other boxes fade in by severity, 60ms
 * apart, while the lines draw outward from 1200ms.
 */
export const CENTRAL_ENTER_MS = 200;
export const NODES_START_MS = 600;
export const NODE_ENTER_MS = 200;
export const NODE_STAGGER_MS = 60;
/** Matches NODE_HEIGHT in lib/layout. */
const NODE_BOX_HEIGHT = 178;

export function enterDelayOf(order: number): number {
  return order === 0 ? 0 : NODES_START_MS + (order - 1) * NODE_STAGGER_MS;
}

const POSITION: Record<Side, Position> = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

function Handles({ fan }: { fan?: Partial<Record<Side, number>> }) {
  const sides: Side[] = ["left", "right", "top", "bottom"];
  return (
    <>
      {sides.map((side) => (
        <Handle key={`${side}-in`} id={`${side}-in`} type="target" position={POSITION[side]} isConnectable={false} />
      ))}
      {sides.map((side) => (
        <Handle key={`${side}-out`} id={`${side}-out`} type="source" position={POSITION[side]} isConnectable={false} />
      ))}
      {fan
        ? sides.flatMap((side) =>
            Array.from({ length: fan[side] ?? 0 }, (_, i) => {
              const count = fan[side] ?? 1;
              // Spread the spokes over the middle 80% of the side.
              const at = `${10 + (80 * (i + 0.5)) / count}%`;
              const style: CSSProperties = side === "left" || side === "right" ? { top: at } : { left: at };
              return <Handle key={`${side}-out-${i}`} id={`${side}-out-${i}`} type="source" position={POSITION[side]} style={style} isConnectable={false} />;
            }),
          )
        : null}
    </>
  );
}

/** Filled dots out of three, with a hollow dot for each step below the top. */
function Dots({ filled, color, size, label }: { filled: number; color: string; size: number; label: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size / 2 }} aria-label={label} role="img">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: size,
            height: size,
            background: i < filled ? color : "transparent",
            border: i < filled ? "none" : `1px solid ${color}`,
          }}
        />
      ))}
    </span>
  );
}

const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

function TypeBadge({ entity }: { entity: Entity }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="badge-square h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: TYPE_HEX[entity.type] }} aria-hidden />
      <span className="text-[10px] font-medium uppercase leading-none tracking-[0.08em]" style={{ color: TYPE_HEX[entity.type] }}>
        {TYPE_LABELS[entity.type]}
      </span>
    </span>
  );
}

function sourceTip(entity: Entity): string {
  const parts = [
    entity.sourceType === "News" ? `${entity.sourceLabel}, ${entity.sourceDate}` : `${entity.sourceType} filed ${entity.sourceDate}`,
    entity.fiscalPeriod,
    entity.sourcePage ? `page ${entity.sourcePage}` : null,
    entity.sourceType === "News" ? null : entity.sourceLabel,
  ];
  return parts.filter(Boolean).join(", ");
}

function CentralBox({
  entity,
  totalDebt,
  company,
  counter,
  revenue,
}: {
  entity: Entity;
  totalDebt?: string | null;
  company?: CompanyProfile | null;
  counter: boolean;
  revenue?: SeriesPoint[] | null;
}) {
  const ratings = company?.ratings ?? [];
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-blue-700">{company?.ticker}</span>
        {company?.sic ? (
          <span className="line-clamp-1 rounded-xs border border-blue-700/40 px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none tracking-[0.08em] text-blue-800" title="SEC industry classification">
            {company.sic}
          </span>
        ) : null}
      </div>
      {counter ? <span className="w-fit rounded-xs bg-red-600 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-white">Counter view</span> : null}
      <div className="line-clamp-1 text-lg font-semibold leading-tight tracking-[-0.01em] text-zinc-900">{entity.name}</div>
      {revenue && revenue.length >= 2 ? (
        <div className="flex items-end gap-2.5" title="Revenue for the last eight quarters, from XBRL. Hover the box for more.">
          <div className="min-w-0 flex-1">
            <QuarterBars points={revenue} color={counter ? "#dc2626" : "#1d4ed8"} height={20} format={compactMoney} label="Revenue" delayMs={300} />
          </div>
          <div className="shrink-0 text-right leading-none">
            <div className="font-mono text-[13px] font-semibold text-zinc-900">{compactMoney(revenue[revenue.length - 1].value)}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-zinc-500">Revenue, last qtr</div>
          </div>
        </div>
      ) : (
        <div className="text-[11px] uppercase leading-snug tracking-[0.08em] text-zinc-500">Subject company</div>
      )}
      {company?.industry && !(revenue && revenue.length >= 2) ? (
        <div className="line-clamp-1 text-xs leading-snug text-zinc-700" title={`How the company describes itself in its 10-K: ${company.industry}`}>
          {company.industry.charAt(0).toUpperCase()}
          {company.industry.slice(1)}
        </div>
      ) : null}
      <div className="mt-auto flex flex-col gap-0.5">
        <div className={`font-mono text-[13px] font-semibold leading-tight ${ratings.length ? "text-zinc-900" : "text-zinc-500"}`}>
          {ratings.length > 0 ? ratings.map((r) => `${r.agency} ${r.rating}${r.outlook ? ` ${r.outlook}` : ""}`).join(" / ") : "Rating not stated"}
        </div>
        {totalDebt ? <div className="font-mono text-xs leading-tight text-zinc-700">{totalDebt} total debt</div> : null}
      </div>
    </div>
  );
}

/** The figure: a bar when it can be compared, the text alone when it cannot, and a dashed note for customers with no disclosed revenue share. */
function Figure({ entity, bar, color }: { entity: Entity; bar?: FigureBar | null; color: string }) {
  const magnitude = entity.magnitude;
  const quote = magnitude ? `${magnitude.label}: "${magnitude.citation.quote}"` : "";
  if (magnitude && bar) {
    return (
      <div className="tip flex flex-col gap-1" data-tip={`${bar.basis}. ${quote}`}>
        <span className="truncate text-[10px] uppercase leading-none tracking-[0.08em] text-zinc-500">{magnitude.label}</span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-xs bg-zinc-200">
            <span className="bar-fill block h-full rounded-xs" style={{ width: `${Math.max(2, Math.min(100, bar.fill * 100))}%`, background: color }} />
          </span>
          <span className="shrink-0 font-display text-[15px] font-semibold leading-none tracking-[-0.01em] text-zinc-900">{bar.figure.text}</span>
        </span>
      </div>
    );
  }
  if (magnitude) {
    return (
      <div className="tip" data-tip={quote}>
        <div className="truncate font-display text-[13px] font-semibold leading-tight text-zinc-900">{magnitude.label}</div>
      </div>
    );
  }
  if (entity.relationType === "CUSTOMER_OF" && magnitude === null) {
    return (
      <div className="tip w-fit rounded-xs border border-dashed border-zinc-400 px-1 font-mono text-[11px] leading-4 text-zinc-500" data-tip="Revenue share is not disclosed in the filings read">
        Rev % n/d
      </div>
    );
  }
  return null;
}

/** One segment per quarter in the window, filled where that quarter's filing names the entity. */
function TimeStrip({ time, color }: { time: NonNullable<EntityNodeData["time"]>; color: string }) {
  const named = time.segments.filter((s) => s.present).map((s) => s.label);
  const tip = `${named.length ? `Named in: ${named.join(", ")}` : "Not named in the 10-Q or 10-K of these quarters"}${
    time.later ? `. On the map from ${time.later}, filed after the latest quarter` : ""
  }`;
  return (
    <span className="tip -mb-1 flex h-[3px] gap-px" data-tip={tip}>
      {time.segments.map((s) => (
        <span key={s.label} className="h-full flex-1 rounded-[1px]" style={{ background: s.present ? color : "#e4e4e7" }} />
      ))}
      {time.later ? <span className="h-full w-1.5 rounded-[1px] border border-dashed" style={{ borderColor: color }} /> : null}
    </span>
  );
}

function EntityNodeComponent({ data, selected }: NodeProps<EntityFlowNode>) {
  const { entity, totalDebt, company, bar, materiality, width, opacity = 1, emphasis, order = 0, fan, time, severityBefore, counter = null } = data;
  const removed = entity.change?.kind === "removed";
  const change = entity.change && !removed ? entity.change : null;
  const red = counter !== null;
  const color = red ? "#dc2626" : TYPE_HEX[entity.type];
  const dark = red ? "#991b1b" : TYPE_HEX_DARK[entity.type];
  const enterDelay = enterDelayOf(order);
  const icon = relationIcon(entity);
  const Icon = icon ? RELATION_ICON[icon] : null;
  const trend = entity.trend && entity.trend !== "unknown" ? entity.trend : null;
  const rank = { none: 0, low: 1, medium: 2, high: 3 } as const;
  const severityMove = severityBefore ? Math.sign(rank[entity.severity] - rank[severityBefore.severity]) : null;
  const severityTip = `${SEVERITY_WORD[entity.severity]} severity${
    severityBefore ? `. ${severityBefore.quarter}: ${SEVERITY_WORD[severityBefore.severity]} · now: ${SEVERITY_WORD[entity.severity]} (Gemini's rating on each quarter's map)` : ""
  }${entity.strategic?.whyItMatters ? `. Gemini's reading: ${entity.strategic.whyItMatters}` : ""}`;

  return (
    <div className={entity.isCentral ? "node-enter-central relative" : "node-enter relative"} style={{ animationDelay: `${enterDelay}ms` }}>
      {/* A soft wash of the type color behind the box; not a shadow, it sits under the box only. */}
      <span
        className="pointer-events-none absolute -z-10"
        style={{ inset: "-50%", background: `radial-gradient(closest-side, ${color} 0%, transparent 100%)`, opacity: 0.15 * Math.min(1, opacity) }}
        aria-hidden
      />
      <div
        className={`entity-box group relative cursor-pointer rounded-xs ${removed ? "border-dashed" : ""}`}
        style={
          {
            width: width ?? (entity.isCentral ? 300 : 240),
            height: NODE_BOX_HEIGHT,
            background: red ? "#fef2f2" : TYPE_TINT[entity.type],
            borderWidth: 3,
            borderStyle: removed ? "dashed" : "solid",
            borderColor: selected || emphasis ? dark : color,
            padding: entity.isCentral ? "20px 22px 18px 28px" : "13px 14px 12px 22px",
            opacity: removed ? Math.min(opacity, 0.5) : opacity,
            "--hover-border": dark,
            "--type-ring": `${color}26`,
          } as CSSProperties
        }
      >
        <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-[2px]" style={{ background: red ? "#dc2626" : SEVERITY_HEX[entity.severity] }} aria-hidden />
        {/* One ring spreads from the middle of the box each time the pointer enters it. */}
        <span className="hover-ripple pointer-events-none absolute left-1/2 top-1/2 rounded-full border" style={{ borderColor: color }} aria-hidden />
        {materiality ? (
          <span
            className="tip absolute bottom-0 left-0 h-0.5"
            style={{ width: `${Math.min(100, materiality.percent)}%`, background: color }}
            data-tip={`Materiality: ${materiality.basis}`}
          />
        ) : null}
        <Handles fan={fan} />

        {entity.isCentral ? (
          <CentralBox entity={entity} totalDebt={totalDebt} company={company} counter={counter === "central"} revenue={data.revenue} />
        ) : (
          <div className="flex h-full flex-col gap-1.5">
            <TypeBadge entity={entity} />
            <div className="line-clamp-2 pr-3 text-sm font-semibold leading-tight tracking-[-0.005em] text-zinc-900" title={entity.headline ?? entity.name}>
              {entity.name}
            </div>
            <div className="flex items-center gap-1 text-xs leading-tight text-zinc-600" title={entity.relationship}>
              {Icon ? <Icon size={12} className="shrink-0 text-zinc-500" aria-hidden /> : null}
              <span className="truncate">{relationText(entity)}</span>
            </div>
            <Figure entity={entity} bar={bar} color={color} />
            <div className="mt-auto flex items-center justify-between gap-2">
              <span className="tip inline-flex items-center gap-1.5" data-tip={severityTip}>
                <Dots filled={SEVERITY_DOTS[entity.severity]} color={SEVERITY_HEX[entity.severity] === "#d4d4d8" ? "#a1a1aa" : SEVERITY_HEX[entity.severity]} size={6} label={`${SEVERITY_WORD[entity.severity]} severity`} />
                <span className="text-[10px] uppercase leading-none tracking-[0.08em] text-zinc-500">{SEVERITY_WORD[entity.severity]}</span>
                {severityMove !== null ? (
                  <span className="text-[9px] leading-none text-zinc-600" aria-label={severityMove > 0 ? "Severity up" : severityMove < 0 ? "Severity down" : "Severity unchanged"}>
                    {severityMove > 0 ? "\u25B2" : severityMove < 0 ? "\u25BC" : "\u2014"}
                  </span>
                ) : null}
              </span>
              {trend ? (
                <span className="tip inline-flex items-center gap-1 text-zinc-700" data-tip={entity.trendBasis ?? `Trend: ${TREND_WORD[trend]}`}>
                  {trend === "stable" ? (
                    <span className="inline-block h-px w-2.5 bg-zinc-500" aria-hidden />
                  ) : (
                    <span className="text-[10px] leading-none" aria-hidden>
                      {trend === "increasing" ? "▲" : "▼"}
                    </span>
                  )}
                  <span className="font-mono text-[11px] leading-none">{TREND_WORD[trend]}</span>
                </span>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="tip inline-flex min-w-0 items-center gap-1" data-tip={removed ? `Last seen: ${sourceTip(entity)}` : sourceTip(entity)}>
                {entity.sourceType === "News" ? (
                  <Newspaper size={10} className="shrink-0 text-zinc-400" aria-hidden />
                ) : (
                  <FileText size={10} className="shrink-0 text-zinc-400" aria-hidden />
                )}
                <span className="truncate font-mono text-[10px] leading-none text-zinc-500">
                  {entity.sourceType === "News"
                    ? `${entity.sourceLabel} · ${entity.sourceDate}`
                    : [entity.fiscalPeriod ?? entity.sourceType, entity.sourcePage ? `p.${entity.sourcePage}` : `filed ${entity.sourceDate}`].join(" · ")}
                </span>
              </span>
              {entity.confidence ? (
                <span className="tip conf-in shrink-0" data-tip={`${CONFIDENCE_LABEL[entity.confidence]}. ${entity.confidenceBasis ?? ""}`} style={{ animationDelay: `${enterDelay + 400}ms` }}>
                  <Dots filled={CONFIDENCE_DOTS[entity.confidence]} color="#059669" size={4} label={CONFIDENCE_LABEL[entity.confidence]} />
                </span>
              ) : null}
            </div>
            {time && time.segments.length ? <TimeStrip time={time} color={color} /> : null}
          </div>
        )}

        {counter === "flagged" ? (
          <span className="tip absolute right-5 top-1.5 text-red-600" data-tip="Named or cited in the Devil's Advocate">
            <Sword size={11} aria-hidden />
          </span>
        ) : null}
        {change ? (
          <span
            className="change-dot absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
            style={{ background: change.kind === "new" ? "#059669" : "#d97706", animationDelay: `${enterDelay + NODE_ENTER_MS}ms` }}
            title={change.kind === "new" ? "New since the previous quarter" : "Changed since the previous quarter"}
          >
            <span className="sr-only">{change.kind === "new" ? "New since the previous quarter." : "Changed since the previous quarter."}</span>
          </span>
        ) : removed ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "#dc2626" }} title="No longer in the filings" />
        ) : null}
      </div>
    </div>
  );
}

export const EntityNode = memo(EntityNodeComponent);
