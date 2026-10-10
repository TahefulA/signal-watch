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
