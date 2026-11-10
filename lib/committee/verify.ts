import type { CommitteeTurn, EvidenceCard, TurnStatus } from "@/types";
import { extractFigures } from "../gemini";

/**
 * The verifier sits between every agent and the screen. A line is verified
 * only when the evidence it cites exists, belongs to its side and has not been
 * used before, and every figure in the line appears on that card (or on the
 * card of the line it answers, so a rebuttal can name the number it disputes).
 * A line that fails stays on screen, struck through, and does not count.
 */

const NEEDS_EVIDENCE = new Set(["open", "attack", "rebut", "answer"]);
const VERDICT = /\b(buy|sell|short (it|the)|go long|recommend (buying|selling|shorting)|price target|we should (lend|invest)|rate (it|this) (as )?(AAA|AA|A|BBB|BB|B|CCC))\b/i;
const HEDGE = /\b(likely|probably|might|may well|could potentially)\b/i;

export interface Verdict {
  status: TurnStatus;
  problems: string[];
}

export function verifyTurn(
  turn: Pick<CommitteeTurn, "speaker" | "move" | "text" | "evidenceId" | "replyingTo">,
  cards: Map<string, EvidenceCard>,
  used: Set<string>,
  replyCard: EvidenceCard | null,
): Verdict {
  const problems: string[] = [];
  const card = turn.evidenceId ? cards.get(turn.evidenceId) ?? null : null;

  if (NEEDS_EVIDENCE.has(turn.move)) {
    if (!turn.evidenceId) problems.push("Cites no evidence.");
    else if (!card) problems.push(`Cites evidence ${turn.evidenceId}, which does not exist.`);
    else if (turn.speaker !== "chair" && turn.speaker !== "user" && card.side !== turn.speaker && turn.move !== "answer")
      problems.push("Cites the other side's evidence.");
    else if (used.has(card.id) && turn.move !== "answer") problems.push("Reuses evidence already cited.");
  }

  const passages = [card?.title, card?.detail, card?.quote, replyCard?.title, replyCard?.detail, replyCard?.quote].filter((x): x is string => Boolean(x));
  const available = new Set(passages.flatMap(extractFigures));
  const missing = extractFigures(turn.text).filter((f) => !available.has(f));
  if (missing.length) problems.push(`Uses figures not on the cited evidence: ${missing.slice(0, 3).join(", ")}.`);
  if (VERDICT.test(turn.text)) problems.push("Makes a trade call or rating, which no agent may do.");
  if (HEDGE.test(turn.text)) problems.push("Hedges instead of stating what the evidence shows.");
  if (turn.text.trim().split(/\s+/).length > 90) problems.push("Longer than a committee line.");

  return { status: problems.length ? "unsupported" : "verified", problems };
}
