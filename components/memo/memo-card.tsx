import type { MemoSection } from "@/types";

interface MemoCardProps {
  section: MemoSection;
  onEntityClick: (entityId: string) => void;
}

export function MemoCard({ section, onEntityClick }: MemoCardProps) {
  return (
    <article className="rounded-sm border border-zinc-800 bg-zinc-900 p-6">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">{section.title}</h3>
      <p className="text-base leading-relaxed text-zinc-300">
        {section.spans.map((span, i) =>
          span.entityId ? (
            <button
              key={i}
              type="button"
              onClick={() => onEntityClick(span.entityId as string)}
              className="text-zinc-100 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300"
            >
              {span.text}
            </button>
          ) : (
            <span key={i}>{span.text}</span>
          ),
        )}
      </p>
    </article>
  );
}
