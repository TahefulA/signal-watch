import type { CommitteeRecord, CommitteeTurn, EvidenceCard, PatternResult, Report, Strength } from "@/types";
import { type Schema, generateJson } from "../gemini";
import { type NewsItem, fetchRecentNews } from "../news";
import { speak } from "./agents";
import { buildCards } from "./evidence";
import { type Plan, Referee } from "./referee";
import { verifyTurn } from "./verify";

/**
 * Live news for a finished committee. Code fetches the newest headlines; one
 * model call picks the one that matters most to a lender and says which side
 * it helps. The Chair tables it as a news line with the headline as its
 * evidence card, and the debate answers it under the same referee and
 * verifier as every other line:
 *   - bad for lenders: it opens a point, and the Analyst must rebut or concede;
 *   - good for lenders: the Analyst uses it to rebut the newest open point.
 */

const DAYS = 14;
/** Headlines are re-read at most every ten minutes. */
const FRESH_MS = 10 * 60_000;

const PICK_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    pick: { type: "STRING" },
    side: { type: "STRING", enum: ["devil", "analyst"] },
    strength: { type: "STRING", enum: ["strong", "moderate", "weak"] },
  },
  required: ["pick", "side", "strength"],
};

async function pickHeadline(report: Report, items: NewsItem[]): Promise<{ item: NewsItem; side: "devil" | "analyst"; strength: Strength } | null> {
  const c = report.graph.company;
  const list = items.map((n, i) => `[${i}] ${n.date} ${n.publisher}: ${n.headline}`).join("\n");
  const system = `You screen news for a credit fund's investment committee on ${c.name} (${c.ticker}). Pick the one headline that most changes whether lenders are repaid in full and on time: debt, refinancing, liquidity, earnings, guidance, ratings, lawsuits, management or owner changes, defaults, asset sales. Ignore stock-price chatter, analyst price targets and headlines about other companies.
- pick: the headline's number, or "none" if no headline bears on the credit.
- side: "devil" if it is bad for lenders, "analyst" if it is good for them.
- strength: "strong" only for an event that directly changes repayment (a default, a refinancing, a rating change, a large loss or win).`;
  const raw = (await generateJson(system, `Headlines from the last ${DAYS} days:\n${list}`, PICK_SCHEMA, { fast: true, thinking: "low", timeoutMs: 30_000 })) as {
    pick?: string;
    side?: string;
    strength?: string;
  };
  const i = Number(raw.pick);
  if (!Number.isInteger(i) || !items[i]) return null;
  const strength: Strength = raw.strength === "strong" || raw.strength === "weak" ? raw.strength : "moderate";
  return { item: items[i], side: raw.side === "analyst" ? "analyst" : "devil", strength };
}

export type NewsResult = { record: CommitteeRecord; added: CommitteeTurn[] } | { message: string };

export async function tableNews(report: Report, patterns: PatternResult[], record: CommitteeRecord): Promise<NewsResult> {
  const started = Date.now();
  const c = report.graph.company;
  const shortName = c.name.replace(/,?\s+(Inc|Corp|Co|Ltd|Plc|Corporation|Company|Holdings)\.?$/i, "");
  const tabled = new Set(record.turns.filter((t) => t.evidence?.kind === "news").map((t) => t.evidence?.source.url));
  const items = (await fetchRecentNews(`"${shortName}" OR ${c.ticker} stock`, 15, DAYS, FRESH_MS)).filter((n) => !tabled.has(n.url));
  if (!items.length) return { message: `No headlines on ${c.ticker} in the last ${DAYS} days that the committee has not seen.` };
  const picked = await pickHeadline(report, items);
  if (!picked) return { message: `None of the ${items.length} headlines from the last ${DAYS} days bears on the credit.` };

  // The debate so far, replayed through the referee so used evidence and open points carry over.
  const cards = buildCards(report, patterns);
  for (const t of record.turns) if (t.evidence && !cards.some((x) => x.id === t.evidence?.id)) cards.push(t.evidence);
  const { item, side, strength } = picked;
  const newsCard: EvidenceCard = {
    id: `${side === "devil" ? "d" : "a"}:news:${record.turns.length + 1}`,
    side,
    kind: "news",
    title: item.headline,
    detail: `${item.publisher || "A news report"} on ${item.date}: "${item.headline}"`,
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
    text: `Live news for the committee: ${newsCard.detail}`,
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
