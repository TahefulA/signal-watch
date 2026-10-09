"use client";

import type { EventCategory } from "@/types";
import { CATEGORY_ORDER, CATEGORY_STYLES } from "@/lib/event-style";

interface FilterButtonsProps {
  active: Set<EventCategory>;
  counts: Record<EventCategory, number>;
  onToggle: (category: EventCategory) => void;
}

export function FilterButtons({ active, counts, onToggle }: FilterButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Event types">
      {CATEGORY_ORDER.map((category) => {
        const style = CATEGORY_STYLES[category];
        const on = active.has(category);
        return (
          <button
            key={category}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(category)}
            className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-xs transition-colors ${
              on ? "border-zinc-700 bg-zinc-900 text-zinc-200" : "border-zinc-800 bg-transparent text-zinc-500 line-through"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${style.swatch} ${on ? "" : "opacity-30"}`} aria-hidden />
            {style.label}
            <span className="font-mono text-zinc-500">{counts[category]}</span>
          </button>
        );
      })}
    </div>
  );
}
