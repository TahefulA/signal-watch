"use client";

import { Sword } from "lucide-react";

export interface CounterItem {
  text: string;
  /** Link to the filing, XBRL concept or Form 4 behind the item. */
  source?: { label: string; url: string } | null;
  quote?: string | null;
}

interface CounterArgumentsCardProps {
  title: string;
  items: CounterItem[];
  /** Shown when the counter-argument exists but nothing in this area was flagged. */
  empty: string;
  /** Shown while the counter-argument is being written. */
  busy?: boolean;
}

/** The Devil's Advocate's concerns for one tab: patterns that fired and claims the argument cited. */
export function CounterArgumentsCard({ title, items, empty, busy = false }: CounterArgumentsCardProps) {
  return (
    <section className="counter-card mb-8 rounded-xs border border-red-600/70 p-5" style={{ background: "var(--devil-bg)" }}>
      <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-red-500">
        <Sword className="h-3 w-3" aria-hidden /> Devil&rsquo;s advocate &mdash; {title}
      </h3>
      {busy && items.length === 0 ? (
        <p className="mt-3 font-mono text-xs text-zinc-500">Analyzing...</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-zinc-200">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />
              <span>
                {item.text}
                {item.quote ? <span className="mt-1 block text-xs italic text-zinc-500">&ldquo;{item.quote}&rdquo;</span> : null}
                {item.source ? (
                  <a
                    href={item.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block font-mono text-[11px] text-zinc-500 hover:text-zinc-200"
                  >
                    {item.source.label}
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
