export type MemoSectionKey = "executive_summary" | "thesis" | "key_risks" | "mitigants" | "relative_value";

/** A run of memo text, optionally linked to an entity on the map. */
export interface MemoSpan {
  text: string;
  entityId?: string;
}

export interface MemoSection {
  key: MemoSectionKey;
  title: string;
  spans: MemoSpan[];
}

export interface Memo {
  sections: MemoSection[];
}
