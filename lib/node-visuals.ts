import type { EntityType, RelationDetail, RelationType, Severity, Entity } from "@/types";

/** Deeper shades of the six entity colors, used for borders, badge squares and bars. */
export const TYPE_HEX: Record<EntityType, string> = {
  company: "#1d4ed8",
  risk: "#b91c1c",
  macro: "#b45309",
  financial: "#047857",
  regulatory: "#6d28d9",
  neutral: "#71717a",
};

/** One shade darker, for hover and the focused box. */
export const TYPE_HEX_DARK: Record<EntityType, string> = {
  company: "#1e3a8a",
  risk: "#7f1d1d",
  macro: "#78350f",
  financial: "#064e3b",
  regulatory: "#4c1d95",
  neutral: "#3f3f46",
};

export const TYPE_TINT: Record<EntityType, string> = {
  company: "#eff6ff",
  risk: "#fef2f2",
  macro: "#fffbeb",
  financial: "#ecfdf5",
  regulatory: "#f5f3ff",
  neutral: "#fafafa",
};

export const SEVERITY_HEX: Record<Severity, string> = {
  high: "#dc2626",
  medium: "#d97706",
  low: "#059669",
  none: "#d4d4d8",
};

export const SEVERITY_DOTS: Record<Severity, number> = { high: 3, medium: 2, low: 1, none: 0 };
export const CONFIDENCE_DOTS = { high: 3, medium: 2, low: 1 } as const;

/**
 * Whether the relationship reads from the entity to the subject company
 * ("Anthropic CUSTOMER OF TeraWulf") or from the company to the entity
 * ("TeraWulf REGULATED BY the PSC"). Decides which end of the line gets the arrow.
 */
const COMPANY_READS_FIRST = new Set<RelationDetail>([
  "HAS_CREDIT_FACILITY_WITH",
  "REGULATED_BY",
  "SUBJECT_TO_ORDER_FROM",
  "LICENSED_BY",
  "MONITORED_BY",
  "EXPOSED_TO",
  "DEPENDENT_ON",
  "VULNERABLE_TO",
  "IMPACTED_BY",
  "SENSITIVE_TO",
  "DRIVEN_BY",
  "JOINT_VENTURE_WITH",
  "PARTNERS_WITH",
  "COMPETES_WITH",
  "DIRECT_COMPETITOR_OF",
  "INDIRECT_COMPETITOR_OF",
]);

export function arrowTowardCompany(entity: Entity): boolean {
  if (entity.relationDetail) return !COMPANY_READS_FIRST.has(entity.relationDetail);
  return entity.relationType !== "REGULATES" && entity.relationType !== "IMPACTS";
}

export type RelationIcon = "out" | "in" | "both" | "shield" | "scale" | "owns" | "impact" | "dollar" | "link";

const ICON_BY_DETAIL: Partial<Record<RelationDetail, RelationIcon>> = {
  SOLE_SUPPLIER_OF: "out",
  PRIMARY_SUPPLIER_OF: "out",
  SECONDARY_SUPPLIER_OF: "out",
  SUPPLIES_TO: "out",
  ANCHOR_TENANT_OF: "in",
  MAJOR_CUSTOMER_OF: "in",
  CUSTOMER_OF: "in",
  TRIAL_CUSTOMER_OF: "in",
  GUARANTEES: "shield",
  PROVIDES_CREDIT_SUPPORT_TO: "dollar",
  LENDS_TO: "dollar",
  HAS_CREDIT_FACILITY_WITH: "dollar",
  DIRECT_COMPETITOR_OF: "both",
  INDIRECT_COMPETITOR_OF: "both",
  COMPETES_WITH: "both",
  REGULATED_BY: "scale",
  SUBJECT_TO_ORDER_FROM: "scale",
  LICENSED_BY: "scale",
  MONITORED_BY: "scale",
  OWNS: "owns",
  MAJOR_HOLDER_OF: "owns",
  DEPENDENT_ON: "link",
  JOINT_VENTURE_WITH: "link",
  PARTNERS_WITH: "link",
  EXECUTIVE_OF: "link",
  DIRECTOR_OF: "link",
};

const ICON_BY_TYPE: Record<RelationType, RelationIcon> = {
  CUSTOMER_OF: "in",
  SUPPLIES_TO: "out",
  LENDS_TO: "dollar",
  GUARANTEES: "shield",
  REGULATES: "scale",
  COMPETES_WITH: "both",
  OWNED_BY: "owns",
  PARTNERS_WITH: "link",
  AFFILIATED_WITH: "link",
  IMPACTS: "impact",
};

export function relationIcon(entity: Entity): RelationIcon | null {
  if (entity.relationDetail) return ICON_BY_DETAIL[entity.relationDetail] ?? "impact";
  return entity.relationType ? ICON_BY_TYPE[entity.relationType] : null;
}

/** "PROVIDES_CREDIT_SUPPORT_TO" -> "Provides credit support to". */
export function relationText(entity: Entity): string {
  const raw = entity.relationDetail ?? entity.relationType;
  if (!raw) return entity.relationship;
  const words = raw.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A figure pulled out of a magnitude label: the value and its unit, for bars. */
export interface Figure {
  /** Display text, e.g. "401 MW" or "$1.02B". */
  text: string;
  value: number;
  unit: string;
}

const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12, k: 1e3, m: 1e6, mm: 1e6, b: 1e9, bn: 1e9 };

/** The first percent, dollar amount or quantity with a unit in a label, or null. */
export function primaryFigure(label: string): Figure | null {
  const percent = label.match(/(-?\d+(?:\.\d+)?)\s?%/);
  if (percent) return { text: `${percent[1]}%`, value: Number(percent[1]), unit: "%" };
  const dollars = label.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(thousand|million|billion|trillion|bn|mm|k|m|b)?\b/i);
  if (dollars) {
    const value = Number(dollars[1].replace(/,/g, "")) * (dollars[2] ? SCALE[dollars[2].toLowerCase()] ?? 1 : 1);
    return { text: compactMoney(value), value, unit: "$" };
  }
  const quantity = label.match(/([\d,]+(?:\.\d+)?)\s*(MW|GW|kW|MWh|GWh|EH\/s|acres|megawatts|miners)\b/i);
  if (quantity) {
    const unit = quantity[2].toLowerCase() === "megawatts" ? "MW" : quantity[2];
    return { text: `${quantity[1]} ${unit}`, value: Number(quantity[1].replace(/,/g, "")), unit: unit.toLowerCase() };
  }
  return null;
}

export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** "$5.72 billion" -> 5.72e9. */
export function parseDisplayMoney(display: string): number | null {
  const m = display.match(/^(-?)\$([\d,]+(?:\.\d+)?)\s*(thousand|million|billion|trillion)?$/i);
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, "")) * (m[3] ? SCALE[m[3].toLowerCase()] : 1);
  return m[1] ? -value : value;
}

/** What the bar under a figure means and how full it is. */
export interface FigureBar {
  figure: Figure;
  /** 0 to 1. */
  fill: number;
  /** "Share of revenue" or "Relative to the largest MW figure on this map (401 MW)". */
  basis: string;
}

/**
 * Bars for each box's figure. A percent of revenue or cost fills that share of
 * the track. Other figures fill relative to the largest figure in the same unit
 * and kind on the map, and only when at least two boxes share that unit, so a
 * lone figure never shows a full bar that means nothing.
 */
export function figureBars(entities: Entity[]): Map<string, FigureBar> {
  const bars = new Map<string, FigureBar>();
  const groups = new Map<string, { id: string; figure: Figure }[]>();
  for (const e of entities) {
    if (e.isCentral || !e.magnitude) continue;
    const figure = primaryFigure(e.magnitude.label);
    if (!figure) continue;
    if (figure.unit === "%") {
      if ((e.magnitude.kind === "revenue" || e.magnitude.kind === "cost") && figure.value > 0 && figure.value <= 100) {
        bars.set(e.id, { figure, fill: figure.value / 100, basis: `Share of ${e.magnitude.kind}, as disclosed` });
      }
      continue;
    }
    const kind = e.magnitude.kind === "capacity" || e.magnitude.kind === "contract" ? "capacity" : e.magnitude.kind;
    const key = `${figure.unit}|${figure.unit === "$" ? kind : "any"}`;
    groups.set(key, [...(groups.get(key) ?? []), { id: e.id, figure }]);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const largest = members.reduce((a, b) => (b.figure.value > a.figure.value ? b : a));
    if (largest.figure.value <= 0) continue;
    for (const m of members) {
      bars.set(m.id, {
        figure: m.figure,
        fill: Math.max(0, m.figure.value) / largest.figure.value,
        basis: `Relative to the largest ${m.figure.unit === "$" ? "dollar" : m.figure.text.split(" ")[1]} figure on this map (${largest.figure.text})`,
      });
    }
  }
  return bars;
}

export interface Materiality {
  /** Percent, 0 to 100. */
  percent: number;
  basis: string;
}

/**
 * Materiality only where a filing gives the denominator: a disclosed share of
 * revenue, or a debt instrument's principal against the reconciled total debt.
 * Everything else has no materiality and keeps the standard box width.
 */
export function materialityOf(entity: Entity, bar: FigureBar | undefined, totalDebt: number | null): Materiality | null {
  if (bar?.figure.unit === "%" && entity.magnitude?.kind === "revenue") {
    return { percent: bar.figure.value, basis: `${bar.figure.text} of revenue, as disclosed` };
  }
  if (totalDebt && totalDebt > 0 && entity.id.startsWith("debt-") && bar?.figure.unit === "$" && /principal|outstanding|indebtedness/i.test(entity.magnitude?.label ?? "")) {
    const percent = (bar.figure.value / totalDebt) * 100;
    return { percent, basis: `${bar.figure.text} is ${percent.toFixed(0)}% of total debt (${compactMoney(totalDebt)})` };
  }
  return null;
}

export const STANDARD_WIDTH = 240;
export const CENTRAL_BOX_WIDTH = 300;

/** Width by materiality: 280 above 25%, 260 above 15%, 240 otherwise, 220 below 5%. */
export function widthFor(materiality: Materiality | null): number {
  if (!materiality) return STANDARD_WIDTH;
  if (materiality.percent > 25) return 280;
  if (materiality.percent > 15) return 260;
  if (materiality.percent < 5) return 220;
  return STANDARD_WIDTH;
}
