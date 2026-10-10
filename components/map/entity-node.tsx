"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { memo } from "react";
import type { CompanyProfile, Confidence, Entity, Trend } from "@/types";
import { SEVERITY_LABELS, SEVERITY_STRIP, TYPE_BORDER, TYPE_BORDER_HOVER, TYPE_LABELS } from "@/lib/entity-style";

export type EntityFlowNode = Node<
  { entity: Entity; totalDebt?: string | null; company?: CompanyProfile | null; dimmed?: boolean },
  "entityNode"
>;

const TREND_ICON: Record<Exclude<Trend, "unknown">, typeof ArrowUp> = {
  increasing: ArrowUp,
  decreasing: ArrowDown,
  stable: ArrowRight,
};

const TREND_LABEL: Record<Trend, string> = {
  increasing: "Increasing",
  decreasing: "Decreasing",
  stable: "No change",
  unknown: "Trend not disclosed",
};

/** Solid for high, hollow for medium, dashed for low. */
const CONFIDENCE_MARK: Record<Confidence, string> = {
  high: "bg-emerald-500",
  medium: "border border-emerald-500 bg-transparent",
  low: "border border-dashed border-amber-500 bg-transparent",
};

function Marks({ entity }: { entity: Entity }) {
  const change = entity.change && entity.change.kind !== "removed" ? entity.change : null;
  return (
    <span className="absolute right-2 top-2 flex items-center gap-1">
      {change ? (
        <span
          className={`h-2 w-2 rounded-full ${change.kind === "new" ? "bg-emerald-500" : "bg-amber-500"}`}
          title={change.kind === "new" ? "New since the previous quarter" : "Changed since the previous quarter"}
        >
          <span className="sr-only">{change.kind === "new" ? "New since the previous quarter." : "Changed since the previous quarter."}</span>
        </span>
      ) : null}
      {entity.confidence ? (
        <span className={`h-2 w-2 rounded-xs ${CONFIDENCE_MARK[entity.confidence]}`} title={`${entity.confidence} confidence: ${entity.confidenceBasis ?? ""}`}>
          <span className="sr-only">{entity.confidence} confidence.</span>
        </span>
      ) : null}
    </span>
  );
}

const handles = (
  <>
    <Handle id="left-in" type="target" position={Position.Left} isConnectable={false} />
    <Handle id="right-in" type="target" position={Position.Right} isConnectable={false} />
    <Handle id="top-in" type="target" position={Position.Top} isConnectable={false} />
    <Handle id="bottom-in" type="target" position={Position.Bottom} isConnectable={false} />
    <Handle id="left-out" type="source" position={Position.Left} isConnectable={false} />
    <Handle id="right-out" type="source" position={Position.Right} isConnectable={false} />
    <Handle id="top-out" type="source" position={Position.Top} isConnectable={false} />
    <Handle id="bottom-out" type="source" position={Position.Bottom} isConnectable={false} />
  </>
);

/** The figure line: a disclosed figure, or for customers an explicit note that no revenue share is disclosed. */
function figureLine(entity: Entity): string | null {
  if (entity.magnitude) return entity.magnitude.label;
  if (entity.relationType === "CUSTOMER_OF" && entity.magnitude === null) return "Revenue % not disclosed";
  return null;
}

function CentralBox({ entity, totalDebt, company }: { entity: Entity; totalDebt?: string | null; company?: CompanyProfile | null }) {
  const ratings = company?.ratings ?? [];
  return (
    <>
      <div className="font-mono text-xs font-medium text-zinc-500">{entity.relationship}</div>
      <div className="mt-0.5 line-clamp-1 font-display text-base font-bold leading-snug text-zinc-900">{entity.name}</div>
      <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-600">
        {company?.industry ? `${company.industry.charAt(0).toUpperCase()}${company.industry.slice(1)}` : "Subject company"}
        {company?.sic ? <span className="text-zinc-400"> · SIC: {company.sic}</span> : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-1 font-mono text-[10px] text-zinc-700">
        <span className="rounded-xs border border-zinc-300 bg-zinc-100 px-1 py-px">
          {ratings.length > 0 ? ratings.map((r) => `${r.agency} ${r.rating}${r.outlook ? ` ${r.outlook}` : ""}`).join(" / ") : "No rating in filings read"}
        </span>
        {totalDebt ? <span className="rounded-xs border border-zinc-300 bg-zinc-100 px-1 py-px">{totalDebt} debt</span> : null}
      </div>
    </>
  );
}

function EntityNodeComponent({ data }: NodeProps<EntityFlowNode>) {
  const { entity, totalDebt, company, dimmed } = data;
  const width = entity.isCentral ? "w-[290px]" : "w-[250px]";
  const trend = entity.trend && entity.trend !== "unknown" ? entity.trend : null;
  const TrendIcon = trend ? TREND_ICON[trend] : null;
  const removed = entity.change?.kind === "removed";
  const figure = figureLine(entity);

  return (
    <div
      className={`entity-box relative flex h-[156px] ${width} cursor-pointer flex-col overflow-hidden rounded-xs border-2 bg-white py-2.5 pl-4 pr-3 transition-colors ${TYPE_BORDER[entity.type]} ${TYPE_BORDER_HOVER[entity.type]} ${removed ? "border-dashed opacity-50" : ""} ${dimmed ? "opacity-30" : ""}`}
      title={entity.name}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_STRIP[entity.severity]}`} aria-hidden />
      <span className="sr-only">{SEVERITY_LABELS[entity.severity]}. </span>
      {handles}
      {entity.isCentral ? (
        <CentralBox entity={entity} totalDebt={totalDebt} company={company} />
      ) : (
        <>
          <Marks entity={entity} />
          <div className="line-clamp-1 pr-8 text-sm font-semibold leading-snug text-zinc-900">{entity.name}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`shrink-0 rounded-xs border px-1 text-[10px] font-medium uppercase leading-4 tracking-wide text-zinc-600 ${TYPE_BORDER[entity.type]}`}>
              {TYPE_LABELS[entity.type]}
            </span>
            <span className="truncate text-[11px] text-zinc-500">{entity.relationship}</span>
          </div>
          {entity.headline ? <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-700">{entity.headline}</div> : null}
          <div className="mt-1 flex min-h-[18px] items-center gap-1.5 font-mono text-[10px] text-zinc-700">
            {figure ? (
              <span className={`truncate rounded-xs border px-1 py-px ${entity.magnitude ? "border-zinc-300 bg-zinc-100" : "border-dashed border-zinc-300 text-zinc-500"}`}>
                {figure}
              </span>
            ) : null}
            {entity.relationType === "CUSTOMER_OF" && entity.magnitude && entity.magnitude.kind !== "revenue" ? (
              <span className="shrink-0 rounded-xs border border-dashed border-zinc-300 px-1 py-px text-zinc-500" title="Revenue share not disclosed in the filings read">
                Rev % n/d
              </span>
            ) : null}
            {TrendIcon && trend ? (
              <span className="inline-flex shrink-0 items-center text-zinc-700" title={entity.trendBasis ?? TREND_LABEL[trend]}>
                <TrendIcon className="h-3 w-3" aria-hidden />
                <span className="sr-only">{TREND_LABEL[trend]}</span>
              </span>
            ) : null}
          </div>
          <div className="mt-auto flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
            <span className={`rounded-xs px-1 leading-4 ${entity.sourceType === "News" ? "border border-zinc-300 text-zinc-500" : "border border-blue-600 font-semibold text-blue-700"}`}>
              {entity.sourceType === "News" ? "NEWS" : "FILING"}
            </span>
            <span className="truncate">
              {removed ? "Last seen " : ""}
              {entity.sourceType}
              {entity.fiscalPeriod ? ` · ${entity.fiscalPeriod}` : ""} · {entity.sourceType === "News" ? entity.sourceDate : `filed ${entity.sourceDate}`}
              {entity.sourcePage && !removed ? ` · p. ${entity.sourcePage}` : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export const EntityNode = memo(EntityNodeComponent);
