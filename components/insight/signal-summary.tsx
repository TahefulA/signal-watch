import type { MemoSpan } from "@/types";

/** The ten-second read above the map. Entity names jump to their boxes. */
export function SignalSummary({ spans, onEntityClick }: { spans: MemoSpan[]; onEntityClick: (id: string) => void }) {
  return (
    <section aria-labelledby="signal-title" className="mb-4 border-l-2 border-zinc-500 bg-zinc-900 px-4 py-3">
      <h3 id="signal-title" className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        Signal
      </h3>
      <p className="mt-1 max-w-4xl text-[15px] leading-relaxed text-zinc-200">
        {spans.map((s, i) =>
          s.entityId ? (
            <a
              key={i}
              href={`#entity-${s.entityId}`}
              onClick={(event) => {
                event.preventDefault();
                onEntityClick(s.entityId as string);
              }}
              className="text-zinc-50 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300"
            >
              {s.text}
            </a>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
    </section>
  );
}
