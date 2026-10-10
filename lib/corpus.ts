import type { SourceType } from "@/types";
import { splitSentences } from "./edgar";

/** One labeled block of source text sent to Gemini, e.g. [D2] 10-K Item 1A. */
export interface CorpusDoc {
  id: string;
  sourceType: SourceType;
  date: string;
  url: string;
  /** Section for filings, publisher for news. */
  label: string;
  text: string;
  sentences: string[];
}

export function makeDoc(
  id: string,
  sourceType: SourceType,
  date: string,
  url: string,
  label: string,
  text: string,
): CorpusDoc {
  const sentences = sourceType === "News" ? [text] : splitSentences(text);
  return { id, sourceType, date, url, label, text, sentences };
}

export function renderCorpus(docs: CorpusDoc[]): string {
  return docs
    .map((d) => `=== [${d.id}] ${d.sourceType === "News" ? `NEWS: ${d.label}` : `${d.sourceType} FILED ${d.date}, ${d.label}`} ${d.sourceType === "News" ? d.date : ""} ===\n${d.text}`)
    .join("\n\n");
}
