import dagre from "@dagrejs/dagre";
import type { Entity, EntityEdge, EntityType } from "@/types";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;
export const CENTRAL_WIDTH = 250;

export type Side = "left" | "right";

export interface Positioned {
  x: number;
  y: number;
  side: Side | null;
}

/** Counterparties and capital structure read left; exposures read right. */
const SIDE_BY_TYPE: Record<EntityType, Side> = {
  company: "left",
  financial: "left",
  neutral: "left",
  risk: "right",
  macro: "right",
  regulatory: "right",
};

const TYPE_ORDER: EntityType[] = ["company", "financial", "neutral", "risk", "regulatory", "macro"];
const SEVERITY_ORDER = ["high", "medium", "low", "none"];

function widthOf(entity: Entity): number {
  return entity.isCentral ? CENTRAL_WIDTH : NODE_WIDTH;
}

function sortEntities(entities: Entity[]): Entity[] {
  return [...entities].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

/** Assigns each direct neighbor to a side by type, then rebalances so neither side towers over the other. */
function assignSides(central: Entity, nodes: Entity[], edges: EntityEdge[]): Map<string, Side> {
  const sides = new Map<string, Side>();
  const direct = nodes.filter((n) => !n.isCentral && edges.some((e) => e.source === central.id && e.target === n.id));
  for (const n of direct) sides.set(n.id, SIDE_BY_TYPE[n.type]);

  const count = (side: Side) => direct.filter((n) => sides.get(n.id) === side).length;
  while (Math.abs(count("left") - count("right")) > 2) {
    const heavy: Side = count("left") > count("right") ? "left" : "right";
    // Move the least severe entity of the most movable type.
    const candidates = sortEntities(direct.filter((n) => sides.get(n.id) === heavy));
    const mover = heavy === "left" ? candidates.at(-1) : candidates[0];
    if (!mover) break;
    sides.set(mover.id, heavy === "left" ? "right" : "left");
  }

  // Two linked entities share a side so their edge never crosses the subject company.
  for (const e of edges) {
    if (e.source === central.id) continue;
    const from = sides.get(e.source);
    if (from && sides.has(e.target)) sides.set(e.target, from);
  }

  // Entities reached only through another entity follow their parent.
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      const parentSide = sides.get(e.source);
      if (parentSide && !sides.has(e.target) && e.target !== central.id) {
        sides.set(e.target, parentSide);
        changed = true;
      }
    }
  }
  for (const n of nodes) if (!n.isCentral && !sides.has(n.id)) sides.set(n.id, SIDE_BY_TYPE[n.type]);
  return sides;
}

function layoutSide(central: Entity, members: Entity[], edges: EntityEdge[], side: Side): Map<string, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: side === "right" ? "LR" : "RL", nodesep: 40, ranksep: 110, marginx: 0, marginy: 0 });
  graph.setNode(central.id, { width: CENTRAL_WIDTH, height: NODE_HEIGHT });
  for (const m of sortEntities(members)) graph.setNode(m.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  const ids = new Set([central.id, ...members.map((m) => m.id)]);
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target)) graph.setEdge(e.source, e.target);
  dagre.layout(graph);

  const anchor = graph.node(central.id);
  const result = new Map<string, { x: number; y: number }>();
  for (const id of ids) {
    const p = graph.node(id);
    result.set(id, { x: p.x - anchor.x, y: p.y - anchor.y });
  }

  // dagre orders a column to reduce crossings, not by importance. Reassign the
  // direct neighbors' vertical slots by type and severity, and carry children along.
  // Only the first column: linked from the company and not from another entity.
  const direct = sortEntities(
    members.filter(
      (m) =>
        edges.some((e) => e.source === central.id && e.target === m.id) &&
        !edges.some((e) => e.target === m.id && e.source !== central.id && ids.has(e.source)),
    ),
  );
  const slots = direct.map((m) => result.get(m.id)?.y ?? 0).sort((a, b) => a - b);
  const shift = new Map<string, number>();
  direct.forEach((m, i) => {
    const current = result.get(m.id);
    if (!current) return;
    shift.set(m.id, slots[i] - current.y);
    result.set(m.id, { x: current.x, y: slots[i] });
  });
  for (const e of edges) {
    const delta = shift.get(e.source);
    const child = result.get(e.target);
    if (delta !== undefined && child && !shift.has(e.target) && e.target !== central.id) {
      result.set(e.target, { x: child.x, y: child.y + delta });
      shift.set(e.target, delta);
    }
  }
  return result;
}

/**
 * Two-sided dagre layout around the subject company: one left-to-right pass for
 * exposures and one right-to-left pass for counterparties, joined at the center.
 * Returns top-left positions.
 */
export function layoutGraph(nodes: Entity[], edges: EntityEdge[]): Map<string, Positioned> {
  const central = nodes.find((n) => n.isCentral);
  const positions = new Map<string, Positioned>();
  if (!central) return positions;
  const sides = assignSides(central, nodes, edges);

  for (const side of ["left", "right"] as const) {
    const members = nodes.filter((n) => sides.get(n.id) === side);
    if (members.length === 0) continue;
    for (const [id, p] of layoutSide(central, members, edges, side)) {
      if (id === central.id) continue;
      positions.set(id, { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2, side });
    }
  }
  positions.set(central.id, { x: -widthOf(central) / 2, y: -NODE_HEIGHT / 2, side: null });
  return positions;
}
