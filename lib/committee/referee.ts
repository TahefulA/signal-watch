import type { CommitteeTurn, EvidenceCard, Move, Scoreboard, Speaker, Strength } from "@/types";

/**
 * The referee is code. It decides who speaks, what they must answer and which
 * moves are allowed, and keeps the score from the moves themselves:
 *   - The Analyst opens; the Devil's Advocate attacks.
 *   - Every open point against the credit must be rebutted with new evidence or
 *     conceded before the Analyst may say anything else.
 *   - The Devil's Advocate may answer a rebuttal once more per point, or raise a new point.
 *   - Evidence is used once. The debate ends at the turn limit, or when the
 *     Devil's Advocate has nothing new and nothing is left to answer.
 */

export const MAX_TURNS = 9;
const MAX_COUNTERS = 1;

export interface Point {
  /** The attack (or news line) that raised it. */
  turnId: string;
  strength: Strength;
  status: "open" | "rebutted" | "conceded";
  counters: number;
  /** The latest rebuttal, which a counter answers. */
  lastRebuttal: string | null;
}

export interface Plan {
  speaker: Extract<Speaker, "analyst" | "devil">;
  moves: Move[];
  /** Turn ids the reply may answer; the first is the one it must answer when there is an obligation. */
  replyTo: string[];
  /** Plain-language instruction to the agent. */
  instruction: string;
}

export class Referee {
  readonly points = new Map<string, Point>();
  readonly used = new Set<string>();
  turns: CommitteeTurn[] = [];

  constructor(private readonly cards: EvidenceCard[]) {}

  unused(side: "analyst" | "devil"): EvidenceCard[] {
    return this.cards.filter((c) => c.side === side && !this.used.has(c.id));
  }

  private openPoints(): Point[] {
    return Array.from(this.points.values()).filter((p) => p.status === "open");
  }

  /** The next speaker and what they may do, or null when the debate is over. */
  next(): Plan | null {
    const spoken = this.turns.filter((t) => t.speaker === "analyst" || t.speaker === "devil" || t.move === "news");
    if (spoken.length >= MAX_TURNS) return null;
    const last = [...this.turns].reverse().find((t) => t.speaker === "analyst" || t.speaker === "devil" || t.move === "news") ?? null;
    if (!last) {
      if (!this.unused("analyst").length) return null;
      return { speaker: "analyst", moves: ["open"], replyTo: [], instruction: "Open the committee: make the strongest case for this credit in two or three sentences, from your strongest evidence." };
    }

    const analystTurn = last.speaker === "devil" || last.move === "news";
    if (analystTurn) {
      const open = this.openPoints();
      // The most recent open point first: it is the one just raised.
      const target = open.sort((a, b) => this.index(b.turnId) - this.index(a.turnId))[0];
      if (!target) return this.devilPlan();
      // A side that only concedes is not a committee: after a concession the Analyst must rebut while it has evidence.
      const lastAnalyst = [...this.turns].reverse().find((t) => t.speaker === "analyst");
      const hasEvidence = this.unused("analyst").length > 0;
      const moves: Move[] = !hasEvidence ? ["concede"] : lastAnalyst?.move === "concede" ? ["rebut"] : ["rebut", "concede"];
      return {
        speaker: "analyst",
        moves,
        replyTo: [target.turnId === last.id ? last.id : target.turnId],
        instruction:
          moves[0] === "rebut" && moves.length === 1
            ? `Answer turn ${target.turnId} with a rebuttal: pick the piece of your evidence that best weighs against it (liquidity, coverage, a check that came back clear, a contract or customer) and say why it matters more, or why the point is narrower than it sounds.`
            : moves.length === 1
              ? `Concede turn ${target.turnId}: you have no evidence left. Say in one sentence what the next filing would have to show for the point to be resolved.`
              : `Answer turn ${target.turnId}. Rebut it with the piece of your evidence that best weighs against it. Concede only if none of your evidence bears on it at all; then say in one sentence what the next filing would have to show.`,
      };
    }
    return this.devilPlan();
  }

  private devilPlan(): Plan | null {
    const last = this.turns[this.turns.length - 1];
    const evidence = this.unused("devil");
    if (!evidence.length) return null;
    const rebutted = last?.move === "rebut" && last.status === "verified" ? this.pointFor(last.replyingTo) : null;
    if (rebutted && rebutted.counters < MAX_COUNTERS) {
      return {
        speaker: "devil",
        moves: ["attack"],
        replyTo: [last.id, this.analystOpening()].filter((x): x is string => Boolean(x)),
        instruction: `Either answer the rebuttal in turn ${last.id} with new evidence that shows why it does not settle the point, or raise a new point against the credit (reply to ${this.analystOpening() ?? "the opening"}). Pick whichever your evidence supports better.`,
      };
    }
    return {
      speaker: "devil",
      moves: ["attack"],
      // A new point answers the opening (or a concession), never a rebuttal: answering a rebuttal is a counter.
      replyTo: [this.analystOpening(), last && last.move !== "rebut" ? last.id : null].filter((x, i, a): x is string => Boolean(x) && a.indexOf(x) === i),
      instruction: "Raise a new point against the credit from your strongest unused evidence. Say why it matters to a lender.",
    };
  }

  private index(id: string): number {
    return this.turns.findIndex((t) => t.id === id);
  }

  private analystOpening(): string | null {
    return this.turns.find((t) => t.speaker === "analyst" && t.move === "open")?.id ?? null;
  }

  /** The point a turn belongs to, following replies back to the attack that raised it. */
  pointFor(id: string | null): Point | null {
    let current = id;
    for (let guard = 0; current && guard < 20; guard++) {
      const p = this.points.get(current);
      if (p) return p;
      current = this.turns.find((t) => t.id === current)?.replyingTo ?? null;
    }
    return null;
  }

  /** Records a turn after verification and updates the points it raises or answers. */
  record(turn: CommitteeTurn): void {
    this.turns.push(turn);
    if (turn.status !== "verified") return;
    if (turn.evidenceId) this.used.add(turn.evidenceId);
    const strength = turn.evidence?.strength ?? "moderate";
    if (turn.move === "news") {
      // News that helps the borrower is tabled but is not a point against the credit.
      if (turn.evidence?.side === "analyst") return;
      this.points.set(turn.id, { turnId: turn.id, strength, status: "open", counters: 0, lastRebuttal: null });
      return;
    }
    if (turn.speaker === "devil" && turn.move === "attack") {
      const answered = this.turns.find((t) => t.id === turn.replyingTo);
      const countered = answered?.move === "rebut" ? this.pointFor(turn.replyingTo) : null;
      if (countered) {
        countered.status = "open";
        countered.counters++;
        if (strength === "strong") countered.strength = "strong";
      } else {
        this.points.set(turn.id, { turnId: turn.id, strength, status: "open", counters: 0, lastRebuttal: null });
      }
      return;
    }
    if (turn.speaker === "analyst" && (turn.move === "rebut" || turn.move === "concede")) {
      const point = this.pointFor(turn.replyingTo);
      if (!point) return;
      point.status = turn.move === "rebut" ? "rebutted" : "conceded";
      if (turn.move === "rebut") point.lastRebuttal = turn.id;
    }
  }

  score(): Scoreboard {
    const points = Array.from(this.points.values());
    return {
      raised: points.length,
      rebutted: points.filter((p) => p.status === "rebutted").length,
      conceded: points.filter((p) => p.status === "conceded").length,
      unansweredStrong: points.filter((p) => p.status === "open" && p.strength === "strong").length,
      verified: this.turns.filter((t) => t.status === "verified").length,
      unsupported: this.turns.filter((t) => t.status === "unsupported").length,
    };
  }
}
