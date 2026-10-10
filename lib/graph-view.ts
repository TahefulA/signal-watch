import type { EntityEdge, EntityGraph } from "@/types";

export interface EntityLink {
  entityId: string;
  /** The relationship read from this entity's point of view. */
  relationship: string;
  direction: "out" | "in";
}

export interface GraphView {
  /** One edge from the subject company to every entity; drives the layout. */
  spokes: EntityEdge[];
  /** Relationships between two entities, shown in the side panel. */
  links: Map<string, EntityLink[]>;
}

/**
 * Splits a graph into spokes from the subject company, which the map draws, and
 * entity-to-entity links, which the side panel lists. Deep chains of boxes read
 * poorly; a single ring around the company keeps every box one step away.
 */
export function viewGraph(graph: EntityGraph): GraphView {
  const central = graph.nodes.find((n) => n.isCentral);
  const spokes: EntityEdge[] = [];
  const links = new Map<string, EntityLink[]>();
  if (!central) return { spokes, links };

  for (const node of graph.nodes) {
    if (node.isCentral) continue;
    const existing = graph.edges.find((e) => e.source === central.id && e.target === node.id);
    spokes.push(existing ?? { id: `${central.id}->${node.id}`, source: central.id, target: node.id, relationship: node.relationship });
  }

  for (const edge of graph.edges) {
    if (edge.source === central.id || edge.target === central.id) continue;
    const add = (id: string, link: EntityLink) => links.set(id, [...(links.get(id) ?? []), link]);
    add(edge.source, { entityId: edge.target, relationship: edge.relationship, direction: "out" });
    add(edge.target, { entityId: edge.source, relationship: edge.relationship, direction: "in" });
  }
  return { spokes, links };
}

export interface HopLink {
  entityId: string;
  /** The relationship as stored on the edge, read from the first entity to the second. */
  relationship: string;
  /** Edge direction relative to the entity being viewed (direct) or the intermediate (second order). */
  direction: "out" | "in";
}

export interface MultiHop {
  direct: HopLink[];
  /** Second-order connections grouped by the intermediate entity they come through. */
  via: { throughId: string; links: HopLink[] }[];
}

/**
 * First- and second-order connections for one entity. The subject company is
 * left out as an intermediate, since every entity connects through it.
 */
export function multiHop(graph: EntityGraph, id: string): MultiHop {
  const central = graph.nodes.find((n) => n.isCentral)?.id;
  const neighbors = (of: string): HopLink[] =>
    graph.edges
      .filter((e) => e.source === of || e.target === of)
      .map((e) => ({
        entityId: e.source === of ? e.target : e.source,
        relationship: e.relationship,
        direction: e.source === of ? ("out" as const) : ("in" as const),
      }));
  const direct = neighbors(id);
  const firstOrder = new Set(direct.map((d) => d.entityId));
  const via = direct
    .filter((d) => d.entityId !== central)
    .map((d) => ({
      throughId: d.entityId,
      links: neighbors(d.entityId).filter((l) => l.entityId !== id && l.entityId !== central && !firstOrder.has(l.entityId)),
    }))
    .filter((g) => g.links.length > 0);
  return { direct, via };
}
