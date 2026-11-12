import type { CommitteeRecord, CommitteeTurn, EvidenceCard, NewsEvent, PatternResult, Report, Strength } from "@/types";
import { speak } from "./agents";
import { buildCards } from "./evidence";
import { type Plan, Referee } from "./referee";
import { verifyTurn } from "./verify";

/**
 * Tables one headline the news radar passed. The Chair puts it to the
 * committee as a news line with the headline as its evidence card, and the
 * debate answers it under the same referee and verifier as every other line:
 *   - bad for lenders: it opens a point, and the Analyst must rebut or concede;
 *   - good for lenders: the Analyst uses it to rebut the newest open point.
 */

export async function tableHeadline(
  report: Report,
  patterns: PatternResult[],
  record: CommitteeRecord,
  event: NewsEvent,
  strength: Strength,
): Promise<{ record: CommitteeRecord; added: CommitteeTurn[] }> {
  const started = Date.now();
  const side = event.direction === "positive" ? "analyst" : "devil";
  const move = event.reaction ? ` The stock moved ${(event.reaction.ret * 100).toFixed(1)}% on ${event.reaction.session}${event.reaction.jump ? `, ${Math.abs(event.reaction.z).toFixed(1)} times its usual daily move` : ""}.` : "";
  const item = { headline: event.headline, publisher: event.publisher, date: event.date, url: event.url };
  // The debate so far, replayed through the referee so used evidence and open points carry over.
  const cards = buildCards(report, patterns);
  for (const t of record.turns) if (t.evidence && !cards.some((x) => x.id === t.evidence?.id)) cards.push(t.evidence);
  const newsCard: EvidenceCard = {
    id: `${side === "devil" ? "d" : "a"}:news:${record.turns.length + 1}`,
    side,
    kind: "news",
    title: item.headline,
    detail: `${item.publisher || "A news report"} on ${item.date}: "${item.headline}".${move}`,
    quote: item.headline,
    source: { label: `${item.publisher || "News"}, ${item.date}`, url: item.url },
    strength,
  };
  cards.push(newsCard);
  const byId = new Map(cards.map((x) => [x.id, x]));
  const referee = new Referee(cards);
  for (const t of record.turns) referee.record(t);

  let n = record.turns.length + 1;
  const news: CommitteeTurn = {
    id: `t${n}`,
    n,
    speaker: "chair",
    move: "news",
    replyingTo: null,
    text: `News radar: ${newsCard.detail}`,
    evidenceId: newsCard.id,
    evidence: newsCard,
    status: "verified",
    problems: [],
  };
  referee.record(news);
  n++;

  const open = Array.from(referee.points.values()).filter((p) => p.status === "open" && p.turnId !== news.id);
  const target = open.sort((a, b) => referee.turns.findIndex((t) => t.id === b.turnId) - referee.turns.findIndex((t) => t.id === a.turnId))[0];
  let plan: Plan;
  let mine: EvidenceCard[];
  let replyCard: EvidenceCard | null;
  if (side === "devil") {
    mine = referee.unused("analyst");
    replyCard = newsCard;
    plan = {
      speaker: "analyst",
      moves: mine.length ? ["rebut", "concede"] : ["concede"],
      replyTo: [news.id],
      instruction: `The Chair tabled news in turn ${news.id} that is bad for lenders. Rebut it with the piece of your evidence that best weighs against it, or concede if none bears on it and say what would settle it.`,
    };
  } else if (target) {
    mine = [newsCard];
    replyCard = referee.turns.find((t) => t.id === target.turnId)?.evidence ?? null;
    plan = {
      speaker: "analyst",
      moves: ["rebut"],
      replyTo: [target.turnId],
      instruction: `The Chair tabled news in turn ${news.id} that is good for lenders. Use it, citing ${newsCard.id}, to rebut turn ${target.turnId}, saying why the news weighs against that point.`,
    };
  } else {
    mine = [newsCard];
    replyCard = null;
    plan = {
      speaker: "analyst",
      moves: ["answer"],
      replyTo: [news.id],
      instruction: `The Chair tabled news in turn ${news.id} that is good for lenders. Citing ${newsCard.id}, say in two sentences what it means for repayment.`,
    };
  }

  const draft = await speak(report, plan, referee.turns, mine, replyCard);
  const pending: CommitteeTurn = {
    id: `t${n}`,
    n,
    speaker: plan.speaker,
    move: draft.move,
    replyingTo: draft.replyingTo,
    text: draft.text,
    evidenceId: draft.evidenceId,
    evidence: draft.evidenceId ? byId.get(draft.evidenceId) ?? null : null,
    status: "pending",
    problems: [],
  };
  const replied = referee.turns.find((t) => t.id === draft.replyingTo)?.evidence ?? null;
  const reply = { ...pending, ...verifyTurn(pending, byId, referee.used, replied) };
  referee.record(reply);

  const added = [news, reply];
  return {
    record: {
      ...record,
      turns: [...record.turns, ...added],
      score: referee.score(),
      calls: record.calls + 2,
      elapsedMs: record.elapsedMs + (Date.now() - started),
    },
    added,
  };
}
