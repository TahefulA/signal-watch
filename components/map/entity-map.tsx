"use client";

import {
  Background,
  Controls,
  type Edge,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";
import type { Entity, EntityGraph } from "@/types";
import { viewGraph } from "@/lib/graph-view";
import { CENTRAL_WIDTH, NODE_HEIGHT, NODE_WIDTH, type Positioned, layoutGraph } from "@/lib/layout";
import { EntityNode, type EntityFlowNode } from "./entity-node";

const nodeTypes = { entityNode: EntityNode };

const EDGE_COLOR = "#52525b";

const defaultEdgeOptions = {
  type: "straight",
  style: { stroke: EDGE_COLOR, strokeWidth: 1 },
  labelStyle: { fontSize: 10, fill: "#a1a1aa", fontWeight: 500 },
  labelBgStyle: { fill: "#09090b", fillOpacity: 0.9 },
  labelBgPadding: [4, 2] as [number, number],
  labelBgBorderRadius: 2,
  focusable: false,
};

interface EntityMapProps {
  graph: EntityGraph;
  /** Shown on the subject company's box when the capital structure is known. */
  totalDebt?: string | null;
  selectedId: string | null;
  /** Bumped each time the memo asks the map to focus a node. */
  focusRequest: number;
  onSelect: (entity: Entity) => void;
}

function toFlowNodes(graph: EntityGraph, positions: Map<string, Positioned>, totalDebt: string | null): EntityFlowNode[] {
  return graph.nodes.map((entity) => {
    const position = positions.get(entity.id) ?? { x: 0, y: 0 };
    return {
      id: entity.id,
      type: "entityNode",
      position: { x: position.x, y: position.y },
      data: { entity, totalDebt: entity.isCentral ? totalDebt : null },
      width: entity.isCentral ? CENTRAL_WIDTH : NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });
}

function Canvas({ graph, totalDebt = null, selectedId, focusRequest, onSelect }: EntityMapProps) {
  const spokes = useMemo(() => viewGraph(graph).spokes, [graph]);
  const relationTypes = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.relationType])), [graph.nodes]);
  const positions = useMemo(() => layoutGraph(graph.nodes, spokes), [graph.nodes, spokes]);
  const initialNodes = useMemo(() => toFlowNodes(graph, positions, totalDebt), [graph, positions, totalDebt]);
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(initialNodes);
  const { setCenter, getNode } = useReactFlow<EntityFlowNode>();

  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);

  useEffect(() => {
    setNodes((current) => current.map((n) => (n.selected === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId })));
  }, [selectedId, setNodes]);

  useEffect(() => {
    if (!focusRequest || !selectedId) return;
    const node = getNode(selectedId);
    if (!node) return;
    const width = node.width ?? NODE_WIDTH;
    const zoom = 1.1;
    // On wide screens the entity panel covers the right 420px; center the box in what remains.
    const panelOffset = window.innerWidth >= 1024 ? 210 / zoom : 0;
    void setCenter(node.position.x + width / 2 + panelOffset, node.position.y + NODE_HEIGHT / 2, { zoom, duration: 300 });
  }, [focusRequest, selectedId, getNode, setCenter]);

  // Spokes leave the company on the side facing the box and carry the typed
  // relationship, e.g. CUSTOMER OF. Reports made before typing existed show no label.
  const edges = useMemo<Edge[]>(
    () =>
      spokes.map((e) => {
        const side = positions.get(e.target)?.side ?? "right";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: side === "right" ? "right-out" : "left-out",
          targetHandle: side === "right" ? "left-in" : "right-in",
          label: relationTypes.get(e.target)?.replace(/_/g, " "),
          // Entities that dropped out of the filings hang off a dashed line.
          ...(e.target.startsWith("removed-") ? { style: { stroke: EDGE_COLOR, strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.6 } } : {}),
        };
      }),
    [spokes, positions, relationTypes],
  );

  return (
    <ReactFlow<EntityFlowNode, Edge>
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelect(node.data.entity)}
      defaultEdgeOptions={defaultEdgeOptions}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.15}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      zoomOnScroll
      className="bg-zinc-950"
    >
      <Background color="#27272a" gap={24} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}

export function EntityMap(props: EntityMapProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
