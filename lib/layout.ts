import type { Entity, EntityType } from "@/types";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 178;
export const CENTRAL_WIDTH = 300;

export type Side = "left" | "right" | "top" | "bottom";

export interface Positioned {
  x: number;
  y: number;
  side: Side | null;
}

const COLUMN_GAP_Y = 24;
const ROW_GAP_X = 28;
/** Space between the subject company and the nearest boxes, so edge labels fit. */
const CLEARANCE = 140;

/**
 * Which side each type prefers, in order. Counterparties read left, exposures
 * right, debt along the top, people and sites along the bottom. A full side
 * overflows to the next one in the list.
 */
const SIDE_PREFERENCE: Record<EntityType, Side[]> = {
  company: ["left", "bottom", "top", "right"],
  financial: ["top", "left", "bottom", "right"],
  neutral: ["bottom", "left", "top", "right"],
  risk: ["right", "bottom", "top", "left"],
  regulatory: ["right", "bottom", "top", "left"],
  macro: ["right", "top", "bottom", "left"],
};

const TYPE_ORDER: EntityType[] = ["company", "financial", "neutral", "regulatory", "risk", "macro"];
const SEVERITY_ORDER = ["high", "medium", "low", "none"];

function sortEntities(entities: Entity[]): Entity[] {
  return [...entities].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
  );
}

/** Orders a row so the most severe boxes sit nearest the middle. */
function centerOut<T>(items: T[]): T[] {
  const out: T[] = [];
  items.forEach((item, i) => (i % 2 === 0 ? out.push(item) : out.unshift(item)));
  return out;
}

/**
 * A frame around the subject company: a column on each side and a row above
 * and below. Rows are no wider than the gap between the columns and sit beyond
 * the columns' height, so no straight edge crosses another box. Boxes can be
 * wider than standard (see widthOf); columns align on their inner edge. Returns
 * top-left positions.
 */
export function layoutGraph(nodes: Entity[], widthOf: (e: Entity) => number = (e) => (e.isCentral ? CENTRAL_WIDTH : NODE_WIDTH)): Map<string, Positioned> {
  const central = nodes.find((n) => n.isCentral);
  const positions = new Map<string, Positioned>();
  if (!central) return positions;
  const others = nodes.filter((n) => !n.isCentral);
  const n = others.length;

  const rowCapacity = Math.max(2, Math.ceil(n / 5));
  const columnCapacity = Math.max(3, Math.ceil((n - 2 * rowCapacity) / 2));
  const capacity: Record<Side, number> = { left: columnCapacity, right: columnCapacity, top: rowCapacity, bottom: rowCapacity };
  const bySide: Record<Side, Entity[]> = { left: [], right: [], top: [], bottom: [] };
  for (const e of sortEntities(others)) {
    const side = SIDE_PREFERENCE[e.type].find((s) => bySide[s].length < capacity[s]) ?? "bottom";
    bySide[side].push(e);
  }

  const rowWidth = (items: Entity[]) => items.reduce((sum, e) => sum + widthOf(e), 0) + Math.max(0, items.length - 1) * ROW_GAP_X;
  const widestRow = Math.max(rowWidth(bySide.top), rowWidth(bySide.bottom), CENTRAL_WIDTH);
  const columnX = Math.max(widestRow / 2 + 30, CENTRAL_WIDTH / 2 + CLEARANCE);
  const columnHeight = (count: number) => count * NODE_HEIGHT + Math.max(0, count - 1) * COLUMN_GAP_Y;
  const tallest = Math.max(columnHeight(bySide.left.length), columnHeight(bySide.right.length), NODE_HEIGHT);
  const rowY = Math.max(tallest / 2 + 50, NODE_HEIGHT / 2 + CLEARANCE);

  const placeColumn = (items: Entity[], side: "left" | "right") => {
    const top = -columnHeight(items.length) / 2;
    items.forEach((e, i) => {
      const x = side === "left" ? -columnX - widthOf(e) : columnX;
      positions.set(e.id, { x, y: top + i * (NODE_HEIGHT + COLUMN_GAP_Y), side });
    });
  };
  const placeRow = (items: Entity[], side: "top" | "bottom") => {
    const ordered = centerOut(items);
    let x = -rowWidth(ordered) / 2;
    for (const e of ordered) {
      const y = side === "top" ? -rowY - NODE_HEIGHT : rowY;
      positions.set(e.id, { x, y, side });
      x += widthOf(e) + ROW_GAP_X;
    }
  };
  placeColumn(bySide.left, "left");
  placeColumn(bySide.right, "right");
  placeRow(bySide.top, "top");
  placeRow(bySide.bottom, "bottom");
  positions.set(central.id, { x: -CENTRAL_WIDTH / 2, y: -NODE_HEIGHT / 2, side: null });
  return positions;
}
