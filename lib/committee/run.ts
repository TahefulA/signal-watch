import type { CommitteeEvent, CommitteeRecord, CommitteeTurn, PatternResult, Report } from "@/types";
import { answerQuestion, chair, speak } from "./agents";
import { buildCards, byStrength } from "./evidence";
import { Referee } from "./referee";
import { verifyTurn } from "./verify";

/**
 * Runs one committee: the referee picks the speaker and the allowed moves, the
 * agent drafts a line, the verifier checks it, the referee records it. Each
 * line is streamed as soon as it is drafted (pending) and again when checked.
 * Midway, the market's rate path is read in as a news line both sides must
 * address, when the borrower has rate exposure.
 */

const NEWS_AFTER = 4;

export async function runCommittee(report: Report, patterns: PatternResult[], emit: (e: CommitteeEvent) => void): Promise<CommitteeRecord> {
  const started = Date.now();
  let calls = 0;
  const cards = byStrength(buildCards(report, patterns));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const referee = new Referee(cards);
  const devil = cards.filter((c) => c.side === "devil").length;
  const analyst = cards.filter((c) => c.side === "analyst").length;
  emit({ type: "trace", text: `Evidence built in code: ${analyst} cards for the Analyst, ${devil} for the Devil's Advocate` });

  // The rate card becomes the news line, so neither side may spend it as an ordinary point.
  const news = byId.get("d:rates") ?? null;
  if (news) referee.used.add(news.id);
  let newsShown = false;

  for (let n = 1; ; n++) {
    if (news && !newsShown && referee.turns.filter((t) => t.speaker !== "user").length >= NEWS_AFTER && referee.turns.at(-1)?.speaker === "analyst") {
      newsShown = true;
      const turn: CommitteeTurn = {
        id: `t${n}`,
        n,
        speaker: "chair",
        move: "news",
        replyingTo: null,
        text: `Market news for the committee: ${news.detail}`,
        evidenceId: news.id,
        evidence: news,
        status: "verified",
        problems: [],
      };
      emit({ type: "trace", text: "Watcher: Kalshi Fed odds read; rate exposure tabled" });
      emit({ type: "turn", turn });
      referee.record(turn);
      emit({ type: "score", score: referee.score() });
      continue;
    }
    const plan = referee.next();
    if (!plan) break;
    const mine = referee.unused(plan.speaker);
    const replyTurn = referee.turns.find((t) => t.id === plan.replyTo[0]) ?? null;
    const replyCard = replyTurn?.evidence ?? null;
    emit({ type: "trace", text: `${plan.speaker === "devil" ? "Devil's Advocate" : "Analyst"} drafting (${mine.length} unused cards)` });
    let draft;
    try {
      calls++;
      draft = await speak(report, plan, referee.turns, mine, replyCard);
    } catch (first) {
      // Gemini is often briefly overloaded: wait once and try the turn again before ending.
      console.warn("Committee turn failed, retrying", first);
      emit({ type: "trace", text: "Gemini is busy; trying that turn again" });
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      try {
        calls++;
        draft = await speak(report, plan, referee.turns, mine, replyCard);
      } catch (error) {
        console.warn("Committee turn failed", error);
        emit({ type: "trace", text: "A model call failed; the committee ends here" });
        break;
      }
    }
    const evidence = draft.evidenceId ? byId.get(draft.evidenceId) ?? null : null;
    const pending: CommitteeTurn = {
      id: `t${n}`,
      n,
      speaker: plan.speaker,
      move: draft.move,
      replyingTo: draft.replyingTo,
      text: draft.text,
      evidenceId: draft.evidenceId,
      evidence,
      status: "pending",
      problems: [],
    };
    emit({ type: "turn", turn: pending });
    const replied = referee.turns.find((t) => t.id === draft.replyingTo)?.evidence ?? null;
    const verdict = verifyTurn(pending, byId, referee.used, replied);
    const turn = { ...pending, ...verdict };
    emit({ type: "verify", id: turn.id, status: turn.status, problems: turn.problems });
    if (verdict.status === "unsupported") emit({ type: "trace", text: `Verifier struck ${turn.id}: ${verdict.problems[0]}` });
    referee.record(turn);
    emit({ type: "score", score: referee.score() });
  }

  let summary = null;
  if (referee.turns.some((t) => t.status === "verified" && t.speaker !== "chair")) {
    emit({ type: "trace", text: "Chair summarising" });
    try {
      calls++;
      summary = await chair(report, referee.turns, cards);
      emit({ type: "chair", summary });
    } catch (error) {
      console.warn("Chair failed", error);
    }
  }
  return {
    turns: referee.turns,
    score: referee.score(),
    chair: summary,
    questionsAsked: 0,
    generatedAt: new Date().toISOString(),
    calls,
    elapsedMs: Date.now() - started,
  };
}

/** Adds a question and its verified answer to a finished committee. */
export async function askCommittee(
  report: Report,
  patterns: PatternResult[],
  record: CommitteeRecord,
  question: string,
  /** A what-if run by code for this question, given as a card to the side its result supports. */
  scenario: { text: string; side: "analyst" | "devil" } | null = null,
): Promise<{ record: CommitteeRecord; added: CommitteeTurn[] }> {
  const cards = buildCards(report, patterns);
  const scenarioId = scenario ? `${scenario.side === "devil" ? "d" : "a"}:scenario` : null;
  if (scenario && scenarioId) {
    cards.unshift({ id: scenarioId, side: scenario.side, kind: "scenario", title: "What-if scenario run by code", detail: scenario.text, quote: null, source: { label: "Cash forecast rerun from filed figures", url: null }, strength: "strong" });
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  const n = record.turns.length + 1;
  const asked: CommitteeTurn = {
    id: `t${n}`,
    n,
    speaker: "user",
    move: "answer",
    replyingTo: null,
    text: question.trim().slice(0, 400),
    evidenceId: null,
    evidence: null,
    status: "verified",
    problems: [],
  };
  const started = Date.now();
  const draft = await answerQuestion(report, scenarioId ? `${question} (Code ran this scenario and the ${scenarioId} card holds its numbers. Answer as ${scenario?.side === "devil" ? "the Devil's Advocate" : "the Analyst"}, citing ${scenarioId}, and say what the result means for a lender.)` : question, record.turns, cards);
  const evidence = draft.evidenceId ? byId.get(draft.evidenceId) ?? null : null;
  const answer: CommitteeTurn = {
    id: `t${n + 1}`,
    n: n + 1,
    speaker: draft.speaker,
    move: "answer",
    replyingTo: asked.id,
    text: draft.text,
    evidenceId: draft.evidenceId,
    evidence,
    status: "pending",
    problems: [],
  };
  // "Not shown in the filings" answers cite nothing and must carry no figures.
  const verdict = draft.evidenceId
    ? verifyTurn(answer, byId, new Set(), null)
    : verifyTurn({ ...answer, move: "concede" }, byId, new Set(), null);
  const checked = { ...answer, ...verdict };
  const added = [asked, checked];
  return {
    record: {
      ...record,
      turns: [...record.turns, ...added],
      questionsAsked: record.questionsAsked + 1,
      calls: record.calls + 1,
      elapsedMs: record.elapsedMs + (Date.now() - started),
    },
    added,
  };
}
