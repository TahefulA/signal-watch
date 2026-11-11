import type { ContagionAssessment, ContagionCompany, ContagionMap, ContagionWarning } from "@/types";
import { extractFigures, generateJson, type Schema } from "../gemini";
import { TRAPDOOR_LABELS } from "../lme-labels";

/**
 * The contagion analyst. Gemini writes three sentences for the portfolio
 * manager from the graph's own facts, each citing the fact ids it uses; code
 * strikes a sentence whose citations do not exist or whose figures are not in
 * the facts it cites.
 */

const MAX_WARNINGS = 12;

interface Fact {
  id: string;
  text: string;
}

function facts(map: ContagionMap, a: ContagionAssessment): Fact[] {
  const c = map.companies.find((x) => x.cik === a.cik) as ContagionCompany;
  const sponsorName = (id: string) => map.sponsors.find((s) => s.id === id)?.name ?? id;
  const out: Fact[] = [{ id: "company", text: `${c.name}${c.ticker ? ` (${c.ticker})` : ""}, owned by ${c.sponsors.map((s) => sponsorName(s.sponsorId)).join(" and ")} per its credit documents` }];
  for (const s of c.sponsors) out.push({ id: `sponsor:${s.sponsorId}`, text: `The credit document defines the sponsor: ${s.quote.slice(0, 300)}` });
  if (a.trigger) {
    out.push({ id: "trigger", text: `${a.trigger.name} (${a.trigger.path.join(", then ")}) filed an 8-K on ${a.trigger.event.date} naming a ${a.trigger.event.term}: "${a.trigger.event.quote.slice(0, 300)}"` });
  }
  for (const r of a.rules.filter((x) => x.fired)) out.push({ id: `rule:${r.key}`, text: r.text });
  c.lme?.open.slice(0, 3).forEach((o, i) => out.push({ id: `clause:${i}`, text: `${TRAPDOOR_LABELS[o.trapdoor]} door open in ${o.section ?? "the credit document"}: "${o.quote.slice(0, 260)}"` }));
  return out;
}

const SYSTEM = `You are a distressed credit analyst writing to a portfolio manager. You get numbered facts about one company in a private equity sponsor's portfolio: who the sponsor is, a sibling company's bankruptcy or liability management deal, and the rules that fired for this company.

Write exactly three sentences explaining why this company could be the sponsor's next liability management target, and what to check. Rules:
- Use only the facts given. Every sentence lists the ids of the facts it relies on in "cites".
- Every number, date and company name in a sentence must appear in a fact it cites.
- Say "could" and "watch", not "will". This is a screen, not a forecast.
- Plain English, no jargon beyond the trapdoor names.`;

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    sentences: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { text: { type: "STRING" }, cites: { type: "ARRAY", items: { type: "STRING" } } }, required: ["text", "cites"] },
    },
  },
  required: ["sentences"],
};

/** Strikes sentences with unknown citations or figures that are not in what they cite. */
export function verifyWarning(raw: { text: string; cites: string[] }[], given: Fact[]): ContagionWarning {
  const byId = new Map(given.map((f) => [f.id, f.text]));
  const sentences = raw.slice(0, 3).map((r) => {
    // The prompt shows ids as [company]; a model that copies the brackets still means the same fact.
    const s = { ...r, cites: r.cites.map((c) => c.trim().replace(/^\[|\]$/g, "")) };
    const unknown = s.cites.filter((id) => !byId.has(id));
    if (!s.cites.length || unknown.length) return { ...s, verified: false, reason: unknown.length ? `Cites ${unknown.join(", ")}, which is not in the graph` : "Cites nothing" };
    const source = s.cites.map((id) => byId.get(id)).join(" ");
    const allowed = new Set(extractFigures(source));
    // "$1.2B" in a fact is "1.2" in either; years and dates are checked the same way.
    const missing = extractFigures(s.text).filter((n) => !allowed.has(n));
    return missing.length ? { ...s, verified: false, reason: `${missing.join(", ")} is not in the facts it cites` } : { ...s, verified: true };
  });
  return { sentences, struck: sentences.filter((s) => !s.verified).length };
}

export async function warnFor(map: ContagionMap, a: ContagionAssessment): Promise<ContagionWarning> {
  const given = facts(map, a);
  const prompt = given.map((f) => `[${f.id}] ${f.text}`).join("\n");
  const out = (await generateJson(SYSTEM, prompt, SCHEMA, { thinking: "low" })) as { sentences?: { text: string; cites: string[] }[] };
  return verifyWarning(out.sentences ?? [], given);
}

/** Adds a warning to each flagged company, nearest to a target first. */
export async function writeWarnings(map: ContagionMap, trace: (t: string) => void = () => {}): Promise<void> {
  const flagged = map.assessments
    .filter((a) => a.flag === "target" || a.flag === "watch")
    .sort((x, y) => y.rules.filter((r) => r.fired).length - x.rules.filter((r) => r.fired).length)
    .slice(0, MAX_WARNINGS);
  for (const a of flagged) {
    try {
      a.warning = await warnFor(map, a);
      trace(`Warning for ${map.companies.find((c) => c.cik === a.cik)?.name}: ${a.warning.struck} struck`);
    } catch (error) {
      trace(`Warning failed: ${String(error)}`);
      a.warning = null;
    }
  }
}
