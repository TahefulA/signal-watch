import type { CompanyProfile, Memo } from "@/types";
import { MemoCard } from "./memo-card";

interface MemoContainerProps {
  memo: Memo;
  company: CompanyProfile;
  generatedAt: string;
  sourceCount: number;
  onEntityClick: (entityId: string) => void;
}

export function MemoContainer({ memo, company, generatedAt, sourceCount, onEntityClick }: MemoContainerProps) {
  return (
    <section aria-labelledby="memo-title" className="border-t border-zinc-800 px-6 py-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,48rem)]">
        <div className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Credit memo</h2>
          <p id="memo-title" className="font-display text-2xl font-bold tracking-tight text-zinc-100">
            {company.name}
          </p>
          <p className="font-mono text-xs text-zinc-500">
            {company.ticker} · {generatedAt.slice(0, 10)}
          </p>
          <p className="text-xs leading-relaxed text-zinc-500">
            Drafted from the {sourceCount} sources behind the map. Underlined names jump to their box.
          </p>
        </div>
        <div className="space-y-6">
          {memo.sections.map((section) => (
            <MemoCard key={section.key} section={section} onEntityClick={onEntityClick} />
          ))}
        </div>
      </div>
    </section>
  );
}
