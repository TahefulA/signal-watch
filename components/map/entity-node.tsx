"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import type { Entity } from "@/types";
import { SEVERITY_LABELS, SEVERITY_STRIP, TYPE_BORDER } from "@/lib/entity-style";

export type EntityFlowNode = Node<{ entity: Entity }, "entityNode">;

function EntityNodeComponent({ data }: NodeProps<EntityFlowNode>) {
  const { entity } = data;
  const width = entity.isCentral ? "w-[250px]" : "w-[220px]";

  return (
    <div
      className={`entity-box relative h-[96px] ${width} cursor-pointer overflow-hidden rounded-sm border-2 bg-white py-2.5 pl-4 pr-3 transition-colors hover:bg-zinc-100 ${TYPE_BORDER[entity.type]}`}
      title={entity.name}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_STRIP[entity.severity]}`} aria-hidden />
      <span className="sr-only">{SEVERITY_LABELS[entity.severity]}. </span>
      <Handle id="left-in" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="right-in" type="target" position={Position.Right} isConnectable={false} />
      <Handle id="left-out" type="source" position={Position.Left} isConnectable={false} />
      <Handle id="right-out" type="source" position={Position.Right} isConnectable={false} />

      {entity.isCentral ? (
        <>
          <div className="font-mono text-xs font-medium text-zinc-500">{entity.relationship}</div>
          <div className="mt-0.5 line-clamp-2 font-display text-base font-bold leading-snug text-zinc-900">{entity.name}</div>
          <div className="mt-1 font-mono text-[10px] text-zinc-400">Subject company</div>
        </>
      ) : (
        <>
          <div className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">{entity.name}</div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">{entity.relationship}</div>
          <div className="mt-1.5 font-mono text-[10px] text-zinc-400">
            {entity.sourceType} · {entity.sourceDate}
          </div>
        </>
      )}
    </div>
  );
}

export const EntityNode = memo(EntityNodeComponent);
