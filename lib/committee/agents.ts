import type { ChairSummary, CommitteeTurn, EvidenceCard, Move, Report } from "@/types";
import { type Schema, extractFigures, generateJson } from "../gemini";
import { dropUnsupported } from "../memo";
import type { Plan } from "./referee";

/**
 * The AI agents. Each has one job and sees only what it needs: its own
 * unused evidence, the debate so far and the referee's instruction. Each
 * returns a small structured object; the referee and the verifier decide
 * whether it counts.
 */

const RULES = `Rules:
- Two or three sentences, under 70 words. Plain English a non-specialist follows.
- Cite exactly one evidence id from your list. Every number you write must be copied exactly from that card or from the line you are answering. Do not calculate, round or convert.
- State what the evidence shows. Do not write "likely", "probably", "might" or "may well".
- Never recommend buying, selling or shorting, never give a rating or a price target, never say whether to lend.
- Speak to the other side directly when answering them.`;

const ROLE = {
  analyst: `You are the credit analyst who wrote the memo on this borrower, defending it before a credit fund's investment committee. You argue the borrower can meet its obligations, but you are honest: you rebut by weighing your evidence against the point: liquidity against a loss, coverage against leverage, a check that came back clear against a suspicion. Concede only when none of your evidence bears on the point, and then say what the next filing would have to show; never invent a remedy such as "a revised forecast".`,
  devil: `You are the devil's advocate on a credit fund's investment committee. Your job is to find what could stop this borrower from repaying lenders in full and on time, using only the evidence you are given. You press hardest where the evidence is strongest, and you answer the analyst's rebuttals on their substance.`,
};

function cardList(cards: EvidenceCard[]): string {
  return cards.map((c) => `[${c.id}] (${c.strength}) ${c.title}\n  ${c.detail}${c.quote ? `\n  Quote: "${c.quote.slice(0, 400)}"` : ""}\n  Source: ${c.source.label}`).join("\n");
}

export function transcript(turns: CommitteeTurn[]): string {
  if (!turns.length) return "(nothing said yet)";
  return turns
    .map((t) => {
      const who = t.speaker === "devil" ? "Devil's Advocate" : t.speaker === "analyst" ? "Analyst" : t.speaker === "chair" ? "Chair" : "Committee member";
      const status = t.status === "unsupported" ? " [struck: failed verification]" : "";
      return `${t.id} ${who} (${t.move}${t.replyingTo ? `, answering ${t.replyingTo}` : ""})${status}: ${t.text}`;
    })
    .join("\n");
}

function header(report: Report): string {
  const c = report.graph.company;
  const d = report.distress;
  return `Borrower: ${c.name} (${c.ticker})${c.sic ? `, ${c.sic}` : ""}.${d ? ` Distress model: ${(d.probability * 100).toFixed(1)}% probability of a bankruptcy filing within 12 months.` : ""}`;
}

export interface TurnDraft {
  move: Move;
  replyingTo: string | null;
  evidenceId: string | null;
  text: string;
}

export async function speak(report: Report, plan: Plan, turns: CommitteeTurn[], mine: EvidenceCard[], replyCard: EvidenceCard | null): Promise<TurnDraft> {
  const schema: Schema = {
    type: "OBJECT",
    properties: {
      move: { type: "STRING", enum: plan.moves },
      replying_to: plan.replyTo.length ? { type: "STRING", enum: plan.replyTo } : { type: "STRING", nullable: true },
      evidence_id: { type: "STRING", enum: [...mine.map((c) => c.id), "none"] },
      text: { type: "STRING" },
    },
    required: ["move", "evidence_id", "text", ...(plan.replyTo.length ? ["replying_to"] : [])],
  };
  const prompt = [
    header(report),
    `The debate so far:\n${transcript(turns)}`,
    replyCard ? `The evidence behind the line you are answering:\n${cardList([replyCard])}` : "",
    `Your unused evidence:\n${cardList(mine) || "(none left)"}`,
    `Your instruction: ${plan.instruction}`,
    `Allowed moves: ${plan.moves.join(", ")}. For "concede", set evidence_id to "none".`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const raw = (await generateJson(`${ROLE[plan.speaker]}\n\n${RULES}`, prompt, schema, { fast: true, thinking: "low", timeoutMs: 30_000 })) as {
    move?: string;
    replying_to?: string | null;
    evidence_id?: string;
    text?: string;
  };
  const move = (plan.moves.find((m) => m === raw.move) ?? plan.moves[0]) as Move;
  return {
    move,
    replyingTo: plan.replyTo.find((r) => r === raw.replying_to) ?? plan.replyTo[0] ?? null,
    evidenceId: raw.evidence_id && raw.evidence_id !== "none" ? raw.evidence_id : null,
    text: (raw.text ?? "").replace(/\s+/g, " ").trim(),
  };
}

const CHAIR_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    agreed: { type: "ARRAY", items: { type: "STRING" } },
    disputed: { type: "ARRAY", items: { type: "STRING" } },
    watch: { type: "ARRAY", items: { type: "OBJECT", properties: { item: { type: "STRING" }, when: { type: "STRING" } }, required: ["item", "when"] } },
  },
  required: ["agreed", "disputed", "watch"],
};

/** The Chair summarises; it never votes, rates or recommends. */
export async function chair(report: Report, turns: CommitteeTurn[], cards: EvidenceCard[]): Promise<ChairSummary> {
  const verified = turns.filter((t) => t.status === "verified");
  const usedCards = cards.filter((c) => verified.some((t) => t.evidenceId === c.id));
  const latest = report.sources.filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K").sort((a, b) => b.date.localeCompare(a.date))[0];
  const facts = [
    header(report),
    `Verified lines of the debate (struck lines are excluded):\n${transcript(verified)}`,
    `Evidence cited:\n${cardList(usedCards)}`,
    latest ? `Latest periodic filing: ${latest.sourceType} filed ${latest.date}.` : "",
  ].join("\n\n");
  const system = `You chair a credit fund's investment committee. Summarise the debate you were given, without adding views of your own.
- agreed: 1 to 3 points both sides accepted, including points the analyst conceded.
- disputed: 1 to 3 points still contested, each naming what each side said.
- watch: 2 to 4 things to check that would settle a disputed point, each with when it will be known (for example "the next 10-Q" or a date that appears in the facts).
Every number must be copied from the facts. One sentence per item. Never vote, rate, recommend a trade or say whether to lend.`;
  const raw = (await generateJson(system, facts, CHAIR_SCHEMA, { fast: true, thinking: "low", timeoutMs: 30_000 })) as {
    agreed?: unknown[];
    disputed?: unknown[];
    watch?: { item?: unknown; when?: unknown }[];
  };
  const allowed = new Set(extractFigures(facts));
  const clean = (x: unknown) => (typeof x === "string" ? dropUnsupported(x, allowed) : { text: "", removed: 1 });
  const keep = (list: unknown[] | undefined) =>
    (list ?? [])
      .map(clean)
      .filter((d) => d.removed === 0 && d.text)
      .map((d) => d.text)
      .slice(0, 3);
  return {
    agreed: keep(raw.agreed),
    disputed: keep(raw.disputed),
    watch: (raw.watch ?? [])
      .map((w) => ({ item: clean(w.item), when: clean(w.when) }))
      .filter((w) => w.item.removed === 0 && w.when.removed === 0 && w.item.text && w.when.text)
      .map((w) => ({ item: w.item.text, when: w.when.text }))
      .slice(0, 4),
  };
}

/** A committee member's question, routed to the side whose evidence answers it. */
export async function answerQuestion(report: Report, question: string, turns: CommitteeTurn[], cards: EvidenceCard[]): Promise<TurnDraft & { speaker: "analyst" | "devil" }> {
  const schema: Schema = {
    type: "OBJECT",
    properties: {
      speaker: { type: "STRING", enum: ["analyst", "devil"] },
      evidence_id: { type: "STRING", enum: [...cards.map((c) => c.id), "none"] },
      text: { type: "STRING" },
    },
    required: ["speaker", "evidence_id", "text"],
  };
  const prompt = [
    header(report),
    `The debate so far:\n${transcript(turns)}`,
    `All evidence (ids starting a: belong to the Analyst, d: to the Devil's Advocate):\n${cardList(cards)}`,
    `A committee member asks: "${question.slice(0, 400)}"`,
    `Answer as the side whose evidence answers the question, citing one card. If no card answers it, set evidence_id to "none" and say in one sentence that the filings and data read do not show it.`,
  ].join("\n\n");
  const raw = (await generateJson(`You answer questions in a credit committee from a fixed set of evidence.\n\n${RULES}`, prompt, schema, {
    fast: true,
    thinking: "low",
    timeoutMs: 30_000,
  })) as { speaker?: string; evidence_id?: string; text?: string };
  const evidenceId = raw.evidence_id && raw.evidence_id !== "none" ? raw.evidence_id : null;
  const speaker = evidenceId?.startsWith("d:") ? "devil" : evidenceId?.startsWith("a:") ? "analyst" : raw.speaker === "devil" ? "devil" : "analyst";
  return { speaker, move: "answer", replyingTo: null, evidenceId, text: (raw.text ?? "").replace(/\s+/g, " ").trim() };
}
