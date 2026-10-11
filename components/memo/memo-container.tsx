import { FileText, Newspaper } from "lucide-react";
import type { CompanyProfile, Entity, Memo } from "@/types";
import { MemoCard } from "./memo-card";

interface MemoContainerProps {
  memo: Memo;
  company: CompanyProfile;
  generatedAt: string;
  sourceCount: number;
  onEntityClick: (entityId: string) => void;
  /** The map's entities, to show the evidence behind each name the memo uses. */
  nodes?: Entity[];
}

export function MemoContainer({ memo, company, generatedAt, sourceCount, onEntityClick, nodes = [] }: MemoContainerProps) {
  const cited = Array.from(new Set(memo.sections.flatMap((s) => s.spans.map((sp) => sp.entityId).filter((id): id is string => Boolean(id)))))
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is Entity => n !== undefined);
  return (
    <section aria-labelledby="memo-title">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,15rem)_minmax(0,52rem)_minmax(0,1fr)]">
        <div className="space-y-3 lg:sticky lg:top-16 lg:self-start">
          <h2 id="memo-title" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300">
            Credit memo
          </h2>
          <p className="font-mono text-xs text-zinc-500">
            {company.ticker} · drafted {generatedAt.slice(0, 10)}
          </p>
          <nav aria-label="Memo sections">
            <ol className="space-y-1.5 text-sm">
              {memo.sections.map((section) => (
                <li key={section.key}>
                  <a href={`#memo-${section.key}`} className="text-zinc-400 hover:text-zinc-100">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <p className="text-xs leading-relaxed text-zinc-500">
            Drafted by Gemini from the {sourceCount} sources behind the map. Sentences with a figure not in the report were removed. Underlined names open their box.
          </p>
        </div>
        <div className="space-y-6">
          {memo.sections.map((section) => (
            <MemoCard key={section.key} section={section} onEntityClick={onEntityClick} />
          ))}
        </div>
        {cited.length ? (
          <aside aria-label="Evidence behind the memo" className="hidden rounded-xs border border-zinc-800 bg-zinc-900/60 2xl:sticky 2xl:top-16 2xl:block 2xl:self-start">
            <h2 className="border-b border-zinc-800 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300">Evidence behind the memo</h2>
            <p className="px-5 pt-3 text-xs text-zinc-500">Each name the memo uses, with the filing line it rests on. Check a claim without leaving the page.</p>
            <ul className="max-h-[70vh] divide-y divide-zinc-800 overflow-y-auto px-5 py-2">
              {cited.map((e) => (
                <li key={e.id} className="py-3">
                  <button type="button" onClick={() => onEntityClick(e.id)} className="text-sm font-medium text-zinc-100 underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-400">
                    {e.name}
                  </button>
                  <p className="mt-1 line-clamp-3 text-xs italic leading-relaxed text-zinc-400">&ldquo;{e.sourceQuote}&rdquo;</p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
                    {e.sourceType === "News" ? <Newspaper className="h-3 w-3" aria-hidden /> : <FileText className="h-3 w-3" aria-hidden />}
                    {e.sourceType === "News" ? `${e.sourceLabel} · ${e.sourceDate}` : [e.sourceType, e.fiscalPeriod, e.sourcePage ? `p.${e.sourcePage}` : `filed ${e.sourceDate}`].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
