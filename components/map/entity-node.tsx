"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { memo } from "react";
import type { Entity, Trend } from "@/types";
import { SEVERITY_LABELS, SEVERITY_STRIP, TYPE_BORDER, TYPE_BORDER_HOVER, TYPE_LABELS } from "@/lib/entity-style";

export type EntityFlowNode = Node<{ entity: Entity; totalDebt?: string | null }, "entityNode">;

const TREND_ICON: Record<Exclude<Trend, "unknown">, typeof ArrowUp> = {
  increasing: ArrowUp,
  decreasing: ArrowDown,
  stable: ArrowRight,
};

const TREND_LABEL: Record<Trend, string> = {
  increasing: "Increasing",
  decreasing: "Decreasing",
  stable: "Stable",
  unknown: "Trend not disclosed",
};

function ChangeDot({ entity }: { entity: Entity }) {
  if (!entity.change) return null;
  const isNew = entity.change.kind === "new";
  return (
    <span
      className={`absolute right-2 top-2 h-2 w-2 rounded-full ${isNew ? "bg-emerald-500" : "bg-amber-500"}`}
      title={isNew ? "New since the previous report" : "Changed since the previous report"}
    >
      <span className="sr-only">{isNew ? "New since the previous report." : "Changed since the previous report."}</span>
    </span>
  );
}

function EntityNodeComponent({ data }: NodeProps<EntityFlowNode>) {
  const { entity, totalDebt } = data;
  const width = entity.isCentral ? "w-[260px]" : "w-[240px]";
  const trend = entity.trend && entity.trend !== "unknown" ? entity.trend : null;
  const TrendIcon = trend ? TREND_ICON[trend] : null;

  return (
    <div
      className={`entity-box relative flex h-[136px] ${width} cursor-pointer flex-col overflow-hidden rounded-xs border-2 bg-white py-2.5 pl-4 pr-3 transition-colors ${TYPE_BORDER[entity.type]} ${TYPE_BORDER_HOVER[entity.type]}`}
      title={entity.name}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_STRIP[entity.severity]}`} aria-hidden />
      <span className="sr-only">{SEVERITY_LABELS[entity.severity]}. </span>
      <ChangeDot entity={entity} />
      <Handle id="left-in" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="right-in" type="target" position={Position.Right} isConnectable={false} />
      <Handle id="left-out" type="source" position={Position.Left} isConnectable={false} />
      <Handle id="right-out" type="source" position={Position.Right} isConnectable={false} />

      {entity.isCentral ? (
        <>
          <div className="font-mono text-xs font-medium text-zinc-500">{entity.relationship}</div>
          <div className="mt-0.5 line-clamp-2 font-display text-base font-bold leading-snug text-zinc-900">{entity.name}</div>
          <div className="mt-1 font-mono text-[10px] text-zinc-500">Subject company</div>
          {totalDebt ? (
            <div className="mt-auto truncate font-mono text-[10px] text-zinc-700">
              <span className="rounded-xs border border-zinc-300 bg-zinc-100 px-1 py-px">{totalDebt} total debt</span>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="line-clamp-1 pr-3 text-sm font-semibold leading-snug text-zinc-900">{entity.name}</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`shrink-0 rounded-xs border px-1 text-[10px] font-medium uppercase leading-4 tracking-wide text-zinc-600 ${TYPE_BORDER[entity.type]}`}
            >
              {TYPE_LABELS[entity.type]}
            </span>
            <span className="truncate text-[11px] text-zinc-500">{entity.relationship}</span>
          </div>
          <div className="mt-1.5 flex min-h-[18px] items-center gap-1.5 font-mono text-[10px] text-zinc-700">
            {entity.magnitude ? (
              <span className="truncate rounded-xs border border-zinc-300 bg-zinc-100 px-1 py-px">{entity.magnitude.label}</span>
            ) : null}
            {TrendIcon && trend ? (
              <span className="inline-flex shrink-0 items-center text-zinc-700" title={TREND_LABEL[trend]}>
                <TrendIcon className="h-3 w-3" aria-hidden />
                <span className="sr-only">{TREND_LABEL[trend]}</span>
              </span>
            ) : null}
          </div>
          <div className="mt-auto font-mono text-[10px] text-zinc-400">
            {entity.sourceType} · {entity.sourceDate}
            {entity.sourcePage ? ` · p. ${entity.sourcePage}` : ""}
          </div>
        </>
      )}
    </div>
  );
}

export const EntityNode = memo(EntityNodeComponent);
