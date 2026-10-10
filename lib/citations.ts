import type { Citation } from "@/types";
import type { CorpusDoc } from "./corpus";
import { extractFigures } from "./gemini";
import { locateQuote, verifyQuote } from "./quotes";

const CONTEXT_LIMIT = 900;

/**
 * Printed page number for a passage. EDGAR filings render each page footer as a
 * bare number followed by the "Table of Contents" link; the first footer after
 * the passage is its page. Returns null when the filing has no such footers.
 */
export function pageOf(fullText: string, quote: string): string | null {
  const found = locateQuote(quote, fullText);
  if (!found) return null;
  const footer = /\n(\d{1,3})\n(?:Table of Contents|TABLE OF CONTENTS)/g;
  footer.lastIndex = found.end;
  const next = footer.exec(fullText);
  return next ? next[1] : null;
}

/** The paragraph containing a passage, trimmed around it when the paragraph is long. */
export function paragraphAround(text: string, quote: string): string | null {
  const found = locateQuote(quote, text);
  if (!found) return null;
  let start = text.lastIndexOf("\n", found.start - 1) + 1;
  let end = text.indexOf("\n", found.end);
  if (end < 0) end = text.length;
  if (end - start > CONTEXT_LIMIT) {
    const spare = Math.max(0, CONTEXT_LIMIT - (found.end - found.start));
    start = Math.max(start, found.start - Math.floor(spare / 2));
    end = Math.min(end, found.end + Math.ceil(spare / 2));
  }
  const paragraph = text.slice(start, end).replace(/\s+/g, " ").trim();
  return paragraph.length > 0 ? paragraph : null;
}

/** Verifies a quote against the document it cites and returns a citation, or null if it is not there. */
export function cite(doc: CorpusDoc | undefined, quote: string | null | undefined): Citation | null {
  if (!doc || !quote) return null;
  const verified = verifyQuote(quote, doc.text, doc.sentences);
  if (!verified) return null;
  return {
    quote: verified,
    sourceType: doc.sourceType,
    sourceDate: doc.date,
    sourceUrl: doc.url,
    sourceLabel: doc.label,
    page: doc.sourceType === "News" ? null : pageOf(doc.fullText, verified),
  };
}

/** True when every figure in the text appears in at least one of the passages. */
export function figuresSupported(text: string, passages: string[]): boolean {
  const available = new Set(passages.flatMap(extractFigures));
  return extractFigures(text).every((f) => available.has(f));
}
