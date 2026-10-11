"use client";

import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, ViewportPortal, useNodesState, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CapitalStructure, DebtInstrument, Entity, EntityGraph, EntityType, Severity, Timeline } from "@/types";
import { useHistory } from "@/components/capital/financial-metrics-panel";
import { viewGraph } from "@/lib/graph-view";
import { useTheme } from "@/lib/theme";
import { CENTRAL_WIDTH, NODE_HEIGHT, type Positioned, type Side, layoutGraph } from "@/lib/layout";
import { arrowTowardCompany, figureBars, materialityOf, parseDisplayMoney, primaryFigure, widthFor } from "@/lib/node-visuals";
import { HoverCard, type HoverCardProps } from "./hover-card";
import { EntityNode, type EntityFlowNode, NODE_ENTER_MS, enterDelayOf } from "./entity-node";
import { SignalEdge, type SignalFlowEdge, SignalMarkers } from "./signal-edge";

const nodeTypes = { entityNode: EntityNode };
const edgeTypes = { signal: SignalEdge };

const OPPOSITE: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, none: 3 };
const EDGES_START_MS = 1200;
const EDGE_STAGGER_MS = 80;
const EDGE_WIDTH: Record<Severity, number> = { high: 2.5, medium: 1.5, low: 1, none: 1 };
/** Lines carrying a dollar figure run from 1px to 6px wide by the square root of the amount. */
const MONEY_MIN = 1;
const MONEY_MAX = 6;
/** How long the pointer rests on a box before its card opens. */
const CARD_DELAY_MS = 140;

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** The debt note's instrument behind a box, by name or alias. */
function instrumentOf(entity: Entity, capital: CapitalStructure | null): DebtInstrument | null {
  if (!capital || entity.isCentral) return null;
  const names = [entity.name, ...(entity.aliases ?? [])].map(slug);
  return capital.instruments.find((i) => names.includes(slug(i.name))) ?? null;
}

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
  /** Counter view: the boxes the Devil's Advocate flags. Null when the view is off. */
  counterIds?: Set<string> | null;
  /** The debt note and ratios, for the hover cards and the due dates on debt lines. */
  capital?: CapitalStructure | null;
}

/** Legend filters fade boxes to 15%; boxes are never hidden, so the layout holds. */
function passesFilters(entity: Entity, filters: MapFilters): boolean {
  if (entity.isCentral) return true;
  if (filters.types.length && !filters.types.includes(entity.type)) return false;
  if (filters.severities.length && !filters.severities.includes(entity.severity)) return false;
  if (filters.highConfidenceOnly && entity.confidence !== undefined && entity.confidence !== "high") return false;
  return true;
}

function Canvas({ graph, totalDebt = null, filters, selectedId, focusRequest, onSelect, onClearSelection, time = null, counterIds = null, capital = null }: EntityMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [card, setCard] = useState<{ id: string; anchor: HoverCardProps["anchor"] } | null>(null);
  const cardTimer = useRef<number | null>(null);
  const history = useHistory(graph.company.cik, capital?.asOf);
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
  const nodesDoneMs = enterDelayOf(graph.nodes.length - 1) + NODE_ENTER_MS;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const edgesDoneMs = EDGES_START_MS + graph.nodes.length * EDGE_STAGGER_MS + 400 + 1200;
    const timer = window.setTimeout(() => setSettled(true), Math.max(nodesDoneMs, edgesDoneMs));
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

  const centralPos = useMemo(() => {
    const p = central ? positions.get(central.id) : null;
    return p ? { x: p.x + CENTRAL_WIDTH / 2, y: p.y + NODE_HEIGHT / 2 } : null;
  }, [central, positions]);

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
  const fadeTo = 0.2;

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
      if (counterIds && !entity.isCentral && !counterIds.has(entity.id)) return 0.2;
      if (related && !related.has(entity.id)) return fadeTo;
      return 1;
    },
    [filters, related, fadeTo, timeData, counterIds],
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
            revenue: entity.isCentral ? (history?.revenue.slice(-8) ?? null) : null,
            bar: v?.bar ?? null,
            materiality: v?.materiality ?? null,
            width: v?.width,
            opacity: opacityOf(entity),
            emphasis: entity.id === focusId ? "focus" : related?.has(entity.id) ? "related" : null,
            order: order.get(entity.id) ?? 0,
            fan: entity.isCentral ? fan.counts : undefined,
            time: timeData.get(entity.id) ?? null,
            severityBefore: time?.timeline.severityBefore[entity.id] ?? null,
            counter: counterIds ? (entity.isCentral ? "central" : counterIds.has(entity.id) ? "flagged" : null) : null,
          },
          width: v?.width,
          height: NODE_HEIGHT,
        };
      }),
    [graph, positions, visuals, totalDebt, selectedId, opacityOf, focusId, related, order, fan, timeData, time, counterIds, history],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(flowNodes);
  const { setCenter, getNode, flowToScreenPosition } = useReactFlow<EntityFlowNode, SignalFlowEdge>();

  const closeCard = useCallback(() => {
    if (cardTimer.current) window.clearTimeout(cardTimer.current);
    cardTimer.current = null;
    setCard(null);
  }, []);
  const openCard = useCallback(
    (id: string) => {
      if (cardTimer.current) window.clearTimeout(cardTimer.current);
      cardTimer.current = window.setTimeout(() => {
        const node = getNode(id);
        if (!node) return;
        const width = node.width ?? CENTRAL_WIDTH;
        const a = flowToScreenPosition({ x: node.position.x, y: node.position.y });
        const b = flowToScreenPosition({ x: node.position.x + width, y: node.position.y });
        setCard({ id, anchor: { left: a.x, right: b.x, top: a.y } });
      }, CARD_DELAY_MS);
    },
    [getNode, flowToScreenPosition],
  );
  useEffect(() => () => closeCard(), [closeCard]);
  const cardEntity = card && card.id !== selectedId ? graph.nodes.find((n) => n.id === card.id) ?? null : null;

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
    const dollars = new Map<string, number>();
    for (const n of graph.nodes) {
      const f = n.magnitude ? primaryFigure(n.magnitude.label) : null;
      if (!n.isCentral && f?.unit === "$" && f.value > 0) dollars.set(n.id, f.value);
    }
    const largest = Math.max(0, ...dollars.values());
    const soon = new Date(Date.now() + 2 * 365 * 86_400_000).toISOString().slice(0, 10);
    const ranked = [...spokes].sort((a, b) => SEVERITY_RANK[byId.get(a.target)?.severity ?? "none"] - SEVERITY_RANK[byId.get(b.target)?.severity ?? "none"]);
    return ranked.map((e, i) => {
      const side = positions.get(e.target)?.side ?? "right";
      const target = byId.get(e.target);
      const active = Boolean(focusId && related?.has(e.target) && (focusId === e.target || focusId === e.source));
      const filteredOut = target ? !passesFilters(target, filters) || Boolean(timeData.get(target.id)?.absent) : false;
      const flagged = Boolean(counterIds?.has(e.target));
      const amount = dollars.get(e.target);
      const figure = target?.magnitude ? (visuals.get(e.target)?.bar?.figure.text ?? primaryFigure(target.magnitude.label)?.text ?? null) : null;
      const maturity = target ? (instrumentOf(target, capital)?.maturity ?? target.relationship.match(/\bdue (20\d\d)\b/)?.[1] ?? null) : null;
      const opacity = filteredOut ? 0.15 : related && !active ? 0.1 : counterIds && !flagged ? 0.1 : 1;
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
          delayMs: EDGES_START_MS + i * EDGE_STAGGER_MS,
          width: amount && largest ? MONEY_MIN + (MONEY_MAX - MONEY_MIN) * Math.sqrt(amount / largest) : EDGE_WIDTH[target?.severity ?? "none"],
          figure,
          due: maturity ? maturity.slice(0, 4) : null,
          // A date is due soon when it falls within two years; a bare year when that year ends within two years.
          urgent: maturity ? (maturity.length === 4 ? `${maturity}-12-31` : maturity) <= soon : false,
          energy: target?.severity === "high",
          counterDash: flagged,
        },
      };
    });
  }, [graph.nodes, spokes, positions, focusId, related, filters, fan, relationLabels, selectedId, settled, timeData, counterIds, visuals, capital]);

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
        onNodeMouseEnter={(_, node) => {
          setHoveredId(node.id);
          openCard(node.id);
        }}
        onNodeMouseLeave={() => {
          setHoveredId(null);
          closeCard();
        }}
        onNodeDragStart={closeCard}
        onMoveStart={closeCard}
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
        <Background id="dots" color={theme === "light" ? "#d4d4d8" : "#27272a"} gap={20} size={1} />
        {/* Graph-paper crosses every 100px. */}
        <Background id="cross" variant={BackgroundVariant.Cross} color={theme === "light" ? "#e4e4e7" : "#1f1f23"} gap={100} size={6} style={{ opacity: 0.3 }} />
        {!settled && centralPos ? (
          <ViewportPortal>
            <div
              className="radar-ring pointer-events-none absolute rounded-full border"
              style={{ left: centralPos.x, top: centralPos.y, borderColor: "rgb(var(--zinc-400))" }}
              aria-hidden
            />
          </ViewportPortal>
        ) : null}
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      {counterIds ? (
        <p className="pointer-events-none absolute left-4 top-4 z-10 rounded-xs border border-red-600 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-50" style={{ background: "var(--devil-bg)" }}>
          Showing: counter-arguments &middot; {counterIds.size} flagged
        </p>
      ) : null}
      {cardEntity && card ? (
        <HoverCard
          key={cardEntity.id}
          entity={cardEntity}
          company={graph.company}
          anchor={card.anchor}
          capital={capital}
          history={history}
          timeline={time?.timeline ?? null}
          bar={visuals.get(cardEntity.id)?.bar ?? null}
          materiality={visuals.get(cardEntity.id)?.materiality ?? null}
          severityBefore={time?.timeline.severityBefore[cardEntity.id] ?? null}
          instrument={instrumentOf(cardEntity, capital)}
        />
      ) : null}
      {/* The one ambient motion in the app: a faint blue wash at the middle that widens and narrows over eight seconds. */}
      <div className="canvas-breathe pointer-events-none absolute inset-0" aria-hidden />
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
