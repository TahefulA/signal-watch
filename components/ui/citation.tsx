import { ExternalLink } from "lucide-react";
import type { Citation } from "@/types";

/** "10-Q · 2026-08-05 · Note 10. DEBT · p. 36" */
export function citationLine(c: { sourceType: string; sourceDate: string; sourceLabel: string; page?: string | null }): string {
  return [c.sourceType, c.sourceDate, c.sourceLabel, c.page ? `p. ${c.page}` : null].filter(Boolean).join(" · ");
}

interface CitationBlockProps {
  citation: Citation;
  /** Smaller type for secondary quotes. */
  compact?: boolean;
}

/** A verbatim quote with its source line and a link to the document. */
export function CitationBlock({ citation, compact = false }: CitationBlockProps) {
  return (
    <figure className={compact ? "mt-2" : "mt-3"}>
      <blockquote
        className={`border-l-2 border-zinc-600 pl-3 italic leading-relaxed text-zinc-300 ${compact ? "text-xs" : "text-sm"}`}
      >
        {citation.quote}
      </blockquote>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-2 pl-3.5 font-mono text-[10px] text-zinc-500">
        <span>{citationLine(citation)}</span>
        <a
          href={citation.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100"
        >
          {citation.sourceType === "News" ? "Article" : "EDGAR"}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </figcaption>
    </figure>
  );
}
