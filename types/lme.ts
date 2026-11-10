/** The liability-management moves a credit document can leave open. */
export type Trapdoor = "jcrew" | "chewy" | "serta";

/**
 * door_open: the document lets the borrower do it. blocker: the document stops it.
 * Read by Gemini from the clause; the quote is checked against the document by code.
 */
export type ClauseStatus = "door_open" | "blocker";

export interface CreditDocument {
  title: string;
  form: string;
  exhibit: string;
  filed: string;
  url: string;
  chars: number;
}

export interface TrapdoorClause {
  trapdoor: Trapdoor;
  status: ClauseStatus;
  /** The document's own text, located by code; null when the model's quote was not found. */
  quote: string | null;
  /** What the model quoted, kept when it could not be found so the strike can be shown. */
  claimed: string;
  section: string | null;
  why: string;
  documentUrl: string;
  /** Other documents with the same clause in the same section. */
  alsoIn?: string[];
  verified: boolean;
}

/** Per trapdoor and document, decided by code from the verified clauses. */
export type TrapdoorRisk = "high" | "medium" | "low" | "not_found";

export interface TrapdoorVerdict {
  trapdoor: Trapdoor;
  risk: TrapdoorRisk;
  /** Why, in code's words: which verified clauses decided it. */
  basis: string;
}

export interface LmeScan {
  documents: CreditDocument[];
  clauses: TrapdoorClause[];
  verdicts: TrapdoorVerdict[];
  struck: number;
  /** Clauses whose quote was found but did not match the trapdoor's terms, dropped by code. */
  offTopic?: number;
  scannedAt: string;
  note: string | null;
}
