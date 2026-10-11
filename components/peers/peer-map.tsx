"use client";

import { Background, Controls, type Edge, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";
import type { Entity, PeerComparison, Report } from "@/types";
import { EntityNode, type EntityFlowNode } from "@/components/map/entity-node";
import { CENTRAL_WIDTH, NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout";
import { useTheme } from "@/lib/theme";

const nodeTypes = { entityNode: EntityNode };
const EDGE_COLOR = "rgb(var(--zinc-600))";
const ROW = NODE_HEIGHT + 28;
const COLUMN = NODE_WIDTH + 170;

interface PeerMapProps {
  subject: Report;
  peer: Report;
  comparison: PeerComparison;
  onSelect: (entity: Entity) => void;
}

function column(items: Entity[], x: number): { entity: Entity; x: number; y: number }[] {
  const top = -((items.length - 1) * ROW) / 2 - NODE_HEIGHT / 2;
  return items.map((entity, i) => ({ entity, x, y: top + i * ROW }));
}

/**
 * Two companies side by side: what they share in the middle, what is unique to
 * each on the outside. A dashed line means the entity is named in that
 * company's filings but was not on its map.
 */
function Canvas({ subject, peer, comparison, onSelect }: PeerMapProps) {
  const [theme] = useTheme();
  const { nodes, edges } = useMemo(() => {
    const a = subject.graph;
    const b = peer.graph;
    const centralA = a.nodes.find((n) => n.isCentral);
    const centralB = b.nodes.find((n) => n.isCentral);
    if (!centralA || !centralB) return { nodes: [] as EntityFlowNode[], edges: [] as Edge[] };

    const pick = (graph: typeof a, id: string) => graph.nodes.find((n) => n.id === id);
    const pairs = comparison.shared
      .filter((s) => s.members.some((m) => m.ticker === a.company.ticker) && s.members.some((m) => m.ticker === b.company.ticker))
      .map((s) => {
        const ma = s.members.find((m) => m.ticker === a.company.ticker);
        const mb = s.members.find((m) => m.ticker === b.company.ticker);
        const entity = (ma?.mapped ? pick(a, ma.entityId) : undefined) ?? (mb?.mapped ? pick(b, mb.entityId) : undefined);
        return entity ? { entity: { ...entity, id: `shared-${entity.id}`, name: s.kind === "theme" ? s.label : entity.name }, ma, mb } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const uniqueA = (comparison.unique[a.company.ticker] ?? []).map((id) => pick(a, id)).filter((e): e is Entity => e !== undefined);
    const uniqueB = (comparison.unique[b.company.ticker] ?? []).map((id) => pick(b, id)).filter((e): e is Entity => e !== undefined);

    const placed = [
      ...column([{ ...centralA, id: "company-a" }], -COLUMN - (CENTRAL_WIDTH - NODE_WIDTH) / 2),
      ...column([{ ...centralB, id: "company-b" }], COLUMN),
      ...column(
        pairs.map((p) => p.entity),
        0,
      ),
      ...column(
        uniqueA.map((e) => ({ ...e, id: `a-${e.id}` })),
        -2 * COLUMN - 40,
      ),
      ...column(
        uniqueB.map((e) => ({ ...e, id: `b-${e.id}` })),
        2 * COLUMN + 40,
      ),
    ];
    const flowNodes: EntityFlowNode[] = placed.map(({ entity, x, y }) => ({
      id: entity.id,
      type: "entityNode",
      position: { x, y },
      data: { entity },
      width: entity.isCentral ? CENTRAL_WIDTH : NODE_WIDTH,
      height: NODE_HEIGHT,
    }));

    const line = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string, dashed: boolean): Edge => ({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: "straight",
      style: { stroke: EDGE_COLOR, strokeWidth: 1, ...(dashed ? { strokeDasharray: "4 4" } : {}) },
      focusable: false,
    });
    const flowEdges: Edge[] = [
      ...pairs.flatMap((p) => [
        line(`a-${p.entity.id}`, "company-a", p.entity.id, "right-out", "left-in", !p.ma?.mapped),
        line(`b-${p.entity.id}`, "company-b", p.entity.id, "left-out", "right-in", !p.mb?.mapped),
      ]),
      ...uniqueA.map((e) => line(`ua-${e.id}`, "company-a", `a-${e.id}`, "left-out", "right-in", false)),
      ...uniqueB.map((e) => line(`ub-${e.id}`, "company-b", `b-${e.id}`, "right-out", "left-in", false)),
    ];
    return { nodes: flowNodes, edges: flowEdges };
  }, [subject, peer, comparison]);

  return (
    <ReactFlow<EntityFlowNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => {
        const e = node.data.entity;
        const original = [...subject.graph.nodes, ...peer.graph.nodes].find((n) => node.id.endsWith(n.id) && n.name === e.name);
        if (original) onSelect(original);
      }}
      fitView
      fitViewOptions={{ padding: 0.1 }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable={false}
      className="bg-zinc-950"
    >
      <Background color={theme === "light" ? "#d4d4d8" : "#27272a"} gap={24} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}

export function PeerMap(props: PeerMapProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
