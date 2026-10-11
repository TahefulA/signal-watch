"use client";

import { Background, Controls, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Entity, EntityGraph, EntityType, Severity, Timeline } from "@/types";
import { viewGraph } from "@/lib/graph-view";
import { useTheme } from "@/lib/theme";
import { CENTRAL_WIDTH, NODE_HEIGHT, type Positioned, type Side, layoutGraph } from "@/lib/layout";
import { arrowTowardCompany, figureBars, materialityOf, parseDisplayMoney, widthFor } from "@/lib/node-visuals";
import { EntityNode, type EntityFlowNode, NODE_ENTER_MS, NODE_STAGGER_MS } from "./entity-node";
import { SignalEdge, type SignalFlowEdge, SignalMarkers } from "./signal-edge";

const nodeTypes = { entityNode: EntityNode };
const edgeTypes = { signal: SignalEdge };

const OPPOSITE: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, none: 3 };
const EDGE_STAGGER_MS = 30;

export interface MapFilters {
  types: EntityType[];
  severities: Severity[];
  highConfidenceOnly: boolean;
}

interface EntityMapProps {
  graph: EntityGraph;
  /** Shown on the subject company's box when the capital structure is known. */
  totalDebt?: string | null;
  filters: MapFilters;
  selectedId: string | null;
  /** Bumped each time the memo asks the map to focus a node. */
  focusRequest: number;
  onSelect: (entity: Entity) => void;
  onClearSelection?: () => void;
  /** The filing timeline and the selected window of quarters (indexes into timeline.quarters). */
  time?: { timeline: Timeline; window: { start: number; end: number } } | null;
}

/** Legend filters fade boxes to 15%; boxes are never hidden, so the layout holds. */
function passesFilters(entity: Entity, filters: MapFilters): boolean {
  if (entity.isCentral) return true;
  if (filters.types.length && !filters.types.includes(entity.type)) return false;
  if (filters.severities.length && !filters.severities.includes(entity.severity)) return false;
  if (filters.highConfidenceOnly && entity.confidence !== undefined && entity.confidence !== "high") return false;
  return true;
}

function Canvas({ graph, totalDebt = null, filters, selectedId, focusRequest, onSelect, onClearSelection, time = null }: EntityMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [theme] = useTheme();
  const central = useMemo(() => graph.nodes.find((n) => n.isCentral) ?? null, [graph.nodes]);
  const spokes = useMemo(() => viewGraph(graph).spokes, [graph]);
  const relationLabels = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.relationDetail ?? n.relationType])), [graph.nodes]);

  // Figures, materiality and widths are computed once per graph.
  const visuals = useMemo(() => {
    const bars = figureBars(graph.nodes);
    const debt = totalDebt ? parseDisplayMoney(totalDebt) : null;
    const byId = new Map(
      graph.nodes.map((e) => {
        const bar = bars.get(e.id) ?? null;
        const materiality = e.isCentral ? null : materialityOf(e, bar ?? undefined, debt);
        return [e.id, { bar, materiality, width: e.isCentral ? CENTRAL_WIDTH : widthFor(materiality) }];
      }),
    );
    return byId;
  }, [graph.nodes, totalDebt]);

  const positions = useMemo(() => layoutGraph(graph.nodes, (e) => visuals.get(e.id)?.width ?? CENTRAL_WIDTH), [graph.nodes, visuals]);

  // Entrance order: the company first, then the most severe boxes.
  const order = useMemo(() => {
    const ranked = [...graph.nodes].sort((a, b) => Number(Boolean(b.isCentral)) - Number(Boolean(a.isCentral)) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    return new Map(ranked.map((e, i) => [e.id, i]));
  }, [graph.nodes]);
  const nodesDoneMs = graph.nodes.length * NODE_STAGGER_MS + NODE_ENTER_MS;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), nodesDoneMs + graph.nodes.length * EDGE_STAGGER_MS + 500);
    return () => window.clearTimeout(timer);
  }, [graph.nodes, nodesDoneMs]);

  // Spokes leaving the company on each side, so they fan out along its edge.
  const fan = useMemo(() => {
    const counts: Partial<Record<Side, number>> = {};
    const slot = new Map<string, string>();
    const bySide = new Map<Side, { id: string; along: number }[]>();
    for (const e of spokes) {
      const p = positions.get(e.target);
      const side = p?.side ?? "right";
      const along = side === "left" || side === "right" ? (p?.y ?? 0) : (p?.x ?? 0);
      bySide.set(side, [...(bySide.get(side) ?? []), { id: e.id, along }]);
    }
    for (const [side, list] of bySide) {
      counts[side] = list.length;
      list.sort((a, b) => a.along - b.along).forEach((item, i) => slot.set(item.id, `${side}-out-${i}`));
    }
    return { counts, slot };
  }, [spokes, positions]);

  const focusId = selectedId ?? hoveredId;
  const related = useMemo(() => {
    if (!focusId || !central) return null;
    // Every box hangs off the company, so the company's neighbours are everything.
    if (focusId === central.id) return new Set(graph.nodes.map((n) => n.id));
    const ids = new Set([focusId, central.id]);
    for (const e of graph.edges) {
      if (e.source === focusId) ids.add(e.target);
      if (e.target === focusId) ids.add(e.source);
    }
    return ids;
  }, [focusId, central, graph.nodes, graph.edges]);
  const fadeTo = selectedId ? 0.2 : 0.3;

  // Per box: the window's quarters and whether each names it. A window that ends
  // before the latest quarter fades boxes its filings never name.
  const timeData = useMemo(() => {
    const out = new Map<string, { segments: { label: string; present: boolean }[]; later: string | null; absent: boolean }>();
    if (!time || time.window.end < 0) return out;
    const { quarters, presence } = time.timeline;
    const lastFiled = quarters[quarters.length - 1]?.filed ?? "";
    const includesLatest = time.window.end === quarters.length - 1;
    for (const e of graph.nodes) {
      const flags = presence[e.id];
      if (!flags) continue;
      const segments = quarters.slice(time.window.start, time.window.end + 1).map((q, i) => ({ label: q.label, present: flags[time.window.start + i] ?? false }));
      const later = includesLatest && e.sourceDate > lastFiled ? `${e.sourceType === "News" ? e.sourceLabel : e.sourceType} ${e.sourceDate}` : null;
      out.set(e.id, { segments, later, absent: !includesLatest && !segments.some((x) => x.present) });
    }
    return out;
  }, [time, graph.nodes]);

  const opacityOf = useCallback(
    (entity: Entity) => {
      if (!passesFilters(entity, filters)) return 0.15;
      if (timeData.get(entity.id)?.absent) return 0.15;
      if (related && !related.has(entity.id)) return fadeTo;
      return 1;
    },
    [filters, related, fadeTo, timeData],
  );

  const flowNodes = useMemo<EntityFlowNode[]>(
    () =>
      graph.nodes.map((entity) => {
        const position = positions.get(entity.id) ?? { x: 0, y: 0, side: null } satisfies Positioned;
        const v = visuals.get(entity.id);
        return {
          id: entity.id,
          type: "entityNode",
          position: { x: position.x, y: position.y },
          selected: entity.id === selectedId,
          data: {
            entity,
            totalDebt: entity.isCentral ? totalDebt : null,
            company: entity.isCentral ? graph.company : null,
            bar: v?.bar ?? null,
            materiality: v?.materiality ?? null,
            width: v?.width,
            opacity: opacityOf(entity),
            emphasis: entity.id === focusId ? "focus" : related?.has(entity.id) ? "related" : null,
            order: order.get(entity.id) ?? 0,
            fan: entity.isCentral ? fan.counts : undefined,
            time: timeData.get(entity.id) ?? null,
            severityBefore: time?.timeline.severityBefore[entity.id] ?? null,
          },
          width: v?.width,
          height: NODE_HEIGHT,
        };
      }),
    [graph, positions, visuals, totalDebt, selectedId, opacityOf, focusId, related, order, fan, timeData, time],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(flowNodes);
  const { setCenter, getNode } = useReactFlow<EntityFlowNode, SignalFlowEdge>();

  // Keep dragged positions when only the styling changes.
  useEffect(() => {
    setNodes((current) => {
      const moved = new Map(current.map((n) => [n.id, n.position]));
      return flowNodes.map((n) => ({ ...n, position: moved.get(n.id) ?? n.position }));
    });
  }, [flowNodes, setNodes]);
  useEffect(() => {
    setNodes(flowNodes);
    // Only a new layout resets positions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  useEffect(() => {
    if (!focusRequest || !selectedId) return;
    // Wait a frame so a map that was just shown has measured its container.
    const timer = window.setTimeout(() => {
      const node = getNode(selectedId);
      if (!node) return;
      const width = node.width ?? CENTRAL_WIDTH;
      const zoom = 1.1;
      // On wide screens the entity panel covers the right 460px; center the box in what remains.
      const panelOffset = window.innerWidth >= 1024 ? 230 / zoom : 0;
      void setCenter(node.position.x + width / 2 + panelOffset, node.position.y + NODE_HEIGHT / 2, { zoom, duration: 300 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusRequest, selectedId, getNode, setCenter]);

  // Spokes carry the typed relationship, e.g. CUSTOMER OF, and an arrow showing
  // which way it reads. Reports made before typing existed show no label.
  const edges = useMemo<SignalFlowEdge[]>(() => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const ranked = [...spokes].sort((a, b) => SEVERITY_RANK[byId.get(a.target)?.severity ?? "none"] - SEVERITY_RANK[byId.get(b.target)?.severity ?? "none"]);
    return ranked.map((e, i) => {
      const side = positions.get(e.target)?.side ?? "right";
      const target = byId.get(e.target);
      const active = Boolean(focusId && related?.has(e.target) && (focusId === e.target || focusId === e.source));
      const filteredOut = target ? !passesFilters(target, filters) || Boolean(timeData.get(target.id)?.absent) : false;
      const opacity = filteredOut ? 0.15 : related && !active ? fadeTo : 1;
      return {
        id: e.id,
        type: "signal",
        source: e.source,
        target: e.target,
        sourceHandle: fan.slot.get(e.id) ?? `${side}-out`,
        targetHandle: `${OPPOSITE[side]}-in`,
        focusable: false,
        data: {
          label: relationLabels.get(e.target)?.replace(/_/g, " "),
          arrowAtSource: target ? arrowTowardCompany(target) : false,
          dashed: e.target.startsWith("removed-"),
          active,
          flashKey: active && selectedId ? selectedId : null,
          opacity,
          drawIn: !settled,
          delayMs: nodesDoneMs + i * EDGE_STAGGER_MS,
        },
      };
    });
  }, [graph.nodes, spokes, positions, focusId, related, filters, fadeTo, fan, relationLabels, selectedId, nodesDoneMs, settled, timeData]);

  return (
    <div className="relative h-full w-full">
      <SignalMarkers />
      <ReactFlow<EntityFlowNode, SignalFlowEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => onSelect(node.data.entity)}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        onPaneClick={() => onClearSelection?.()}
        fitView
        fitViewOptions={{ padding: 0.05 }}
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
        <Background color={theme === "light" ? "#d4d4d8" : "#27272a"} gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      {/* Darkens the edges of the canvas so the eye settles on the middle. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 50%, transparent 55%, var(--canvas-vignette) 100%)" }}
        aria-hidden
      />
    </div>
  );
}

export function EntityMap(props: EntityMapProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
