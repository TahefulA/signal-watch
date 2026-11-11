import type { ContagionAssessment, ContagionCompany, ContagionFlag, LmeEventKind } from "@/types";
import { TRAPDOOR_LABELS } from "@/lib/lme-labels";

export const FLAG_STYLE: Record<ContagionFlag, { label: string; border: string; text: string; fill: string }> = {
  target: { label: "Likely next target", border: "border-red-600", text: "text-red-500", fill: "#dc2626" },
  watch: { label: "Watch", border: "border-amber-500", text: "text-amber-500", fill: "#f59e0b" },
  clear: { label: "Clear", border: "border-emerald-600", text: "text-emerald-500", fill: "#10b981" },
  history: { label: "No longer files", border: "border-zinc-600", text: "text-zinc-400", fill: "rgb(var(--zinc-500))" },
};

/** The page's words for things a credit lawyer would call by their legal names. */
export const KIND_PLAIN: Record<LmeEventKind, string> = {
  lme: "lender squeeze deal",
  restructuring: "restructuring deal with lenders",
  bankruptcy: "bankruptcy filing",
};
export const KIND_SHORT: Record<LmeEventKind, string> = { lme: "Squeeze", restructuring: "Restructuring", bankruptcy: "Chapter 11" };

/** Each kind has a shape as well as a colour, so the marks read without colour. */
export const KIND_MARK: Record<LmeEventKind, { color: string; shape: "diamond" | "square" | "circle" }> = {
  lme: { color: "#ef4444", shape: "diamond" },
  restructuring: { color: "#f59e0b", shape: "square" },
  bankruptcy: { color: "rgb(var(--zinc-300))", shape: "circle" },
};

export const month = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export type SignalKey = "willing" | "able" | "needs";

export interface Signal {
  key: SignalKey;
  title: string;
  question: string;
  on: boolean;
  /** Lit by one of its two parts only: "needs to" counts debt coming due and a weak balance sheet separately. */
  partial?: boolean;
  /** One plain sentence per part of the signal. */
  lines: { on: boolean; text: string; url?: string }[];
}

/**
 * The four rules as three questions a lender asks: is the owner willing
 * (it has done this before), is the company able (its loan documents leave a
 * loophole open), and does it need to (a maturity coming due, or a weak
 * balance sheet).
 */
export function signals(c: ContagionCompany, a: ContagionAssessment): Signal[] {
  const rule = (k: string) => a.rules.find((r) => r.key === k);
  const history = rule("sponsor_history");
  const trapdoor = rule("trapdoor_open");
  const maturity = rule("maturity");
  const distress = rule("distress");
  const sibling = history?.fired && a.trigger ? a.trigger : null;
  const open = (c.lme?.verdicts ?? []).filter((v) => v.risk === "high" || v.risk === "medium");
  return [
    {
      key: "willing",
      title: "Willing",
      question: "Has the owner done this before?",
      on: Boolean(history?.fired),
      lines: [
        sibling
          ? { on: true, text: `${sibling.name}, owned by the same firm, had a ${KIND_PLAIN[sibling.event.kind]} in ${month(sibling.event.date)}.`, url: sibling.event.url }
          : { on: false, text: "None of the owner's other public companies has squeezed lenders or filed for bankruptcy in the last ten years." },
      ],
    },
    {
      key: "able",
      title: "Able",
      question: "Do its loan documents leave a loophole?",
      on: Boolean(trapdoor?.fired),
      lines: [
        c.lme === undefined
          ? { on: false, text: "Its loan documents have not been checked yet." }
          : c.lme === null
            ? { on: false, text: "No credit agreement or indenture was found on EDGAR to check." }
            : open.length
              ? { on: true, text: `${open.length} of 3 known loopholes left open: ${open.map((v) => TRAPDOOR_LABELS[v.trapdoor]).join(", ")}.`, url: c.lme.open[0]?.url }
              : { on: false, text: "Every known loophole found was blocked." },
      ],
    },
    {
      key: "needs",
      title: "Needs to",
      question: "Is it under pressure to act?",
      on: Boolean(maturity?.fired || distress?.fired),
      partial: Boolean(maturity?.fired) !== Boolean(distress?.fired),
      lines: [
        { on: Boolean(maturity?.fired), text: maturity?.fired ? `Debt coming due: ${maturity.text}.` : "No large amount of debt due in the next two years.", url: maturity?.url },
        { on: Boolean(distress?.fired), text: distress?.text ? `${distress.text}.` : "No recent balance sheet to score." },
      ],
    },
  ];
}

/** One sentence that says what the signals add up to. */
export function verdictLine(c: ContagionCompany, a: ContagionAssessment): string {
  if (!c.active) return `${c.name} no longer files with the SEC; it stays on the map for its history.`;
  const s = signals(c, a);
  const on = s.filter((x) => x.on).map((x) => x.title.toLowerCase());
  if (a.flag === "target") return `Every warning sign is on: the owner has done this before, the loan documents allow it, and the company is under pressure.`;
  if (!on.length) return "No warning sign is on today.";
  const needs = s.find((x) => x.key === "needs");
  if (on.length === 3 && needs?.partial) return "The owner has done this before and the loan documents allow it. It is under some pressure, but not yet both debt coming due and a weak balance sheet.";
  const off = s.filter((x) => !x.on).map((x) => x.title.toLowerCase());
  return `${on.length} of 3 warning signs on: ${on.join(" and ")}. Not yet ${off.join(" or ")}.`;
}
