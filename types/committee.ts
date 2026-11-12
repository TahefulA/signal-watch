export type Speaker = "analyst" | "devil" | "chair" | "user";

/**
 * open: the side's opening point. attack: a new point against the credit.
 * rebut: answers a point with evidence. concede: accepts a point; it stays open.
 * answer: replies to a user question. news: a market event both sides must address.
 */
export type Move = "open" | "attack" | "rebut" | "concede" | "answer" | "news";

export type Strength = "strong" | "moderate" | "weak";

/** One piece of evidence a side may cite, built in code from the checked report. */
export interface EvidenceCard {
  id: string;
  side: "analyst" | "devil";
  kind: "pattern" | "distress" | "filing_change" | "rate" | "metric" | "entity" | "lme" | "scenario" | "sponsor" | "news";
  title: string;
  /** The finding, with its figures, as code wrote it. */
  detail: string;
  quote: string | null;
  source: { label: string; url: string | null };
  strength: Strength;
}

export type TurnStatus = "pending" | "verified" | "unsupported";

export interface CommitteeTurn {
  id: string;
  n: number;
  speaker: Speaker;
  move: Move;
  /** The turn this one answers. */
  replyingTo: string | null;
  text: string;
  evidenceId: string | null;
  evidence: EvidenceCard | null;
  status: TurnStatus;
  /** What the verifier found wrong, for an unsupported turn. */
  problems: string[];
}

/** Kept by code, from the moves; the agents never score themselves. */
export interface Scoreboard {
  raised: number;
  rebutted: number;
  conceded: number;
  /** Strong points against the credit nobody has rebutted or conceded. */
  unansweredStrong: number;
  verified: number;
  unsupported: number;
}

export interface ChairSummary {
  agreed: string[];
  disputed: string[];
  watch: { item: string; when: string }[];
}

export interface CommitteeRecord {
  turns: CommitteeTurn[];
  score: Scoreboard;
  chair: ChairSummary | null;
  questionsAsked: number;
  generatedAt: string;
  /** Gemini calls and their total time, for cost and latency. */
  calls: number;
  elapsedMs: number;
}

export type CommitteeEvent =
  | { type: "trace"; text: string }
  | { type: "turn"; turn: CommitteeTurn }
  | { type: "verify"; id: string; status: TurnStatus; problems: string[] }
  | { type: "score"; score: Scoreboard }
  | { type: "chair"; summary: ChairSummary }
  | { type: "done"; record: CommitteeRecord }
  | { type: "error"; message: string };
