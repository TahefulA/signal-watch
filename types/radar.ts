export type NewsDirection = "negative" | "positive" | "neutral";

export type NewsEventType =
  | "default_or_missed_payment"
  | "bankruptcy_or_restructuring"
  | "refinancing_or_new_debt"
  | "liquidity_or_funding"
  | "earnings_or_guidance"
  | "rating_change"
  | "legal_or_regulatory"
  | "management_or_owner_change"
  | "asset_sale_or_deal"
  | "contract_or_customer"
  | "other";

/** The stock's move on the first sessions after a headline, against its own recent daily moves. */
export interface MarketReaction {
  /** The session the move is measured on. */
  session: string;
  /** Close-to-close return of that session. */
  ret: number;
  /** ret divided by the robust standard deviation of the prior 60 daily returns. */
  z: number;
  /** |z| at or above JUMP_Z: a move ordinary noise would rarely produce. */
  jump: boolean;
  /** The session has not closed yet, so the move is so far. */
  partial: boolean;
}

/** One headline the radar has seen, with every number that decided what happened to it. */
export interface NewsEvent {
  ticker: string;
  url: string;
  headline: string;
  publisher: string;
  date: string;
  seenAt: string;
  /** 1 minus the closest overlap with a headline seen in the past week; null before it was compared. */
  novelty: number;
  /** The earlier headline this repeats, when novelty is below the cut. */
  duplicateOf: string | null;
  /** From the model, scored only for novel headlines. */
  relevance: number | null;
  confidence: number | null;
  direction: NewsDirection | null;
  eventType: NewsEventType | null;
  reaction: MarketReaction | null;
  /** Passed both filters and has a direction, so it may go to the committee. */
  passed: boolean;
  /** Why it stopped, or why it went through. */
  reason: string;
  /** The committee line that tabled it, when it was tabled. */
  tabledTurn: string | null;
}

export interface RadarScan {
  ticker: string;
  scannedAt: string;
  fetched: number;
  fresh: number;
  events: NewsEvent[];
}
