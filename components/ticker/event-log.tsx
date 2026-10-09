"use client";

import type { EventCategory, SignalEvent } from "@/types";
import { formatShortDate } from "@/lib/dates";
import { CATEGORY_STYLES } from "@/lib/event-style";

interface EventLogProps {
  events: SignalEvent[];
  activeCategories: Set<EventCategory>;
  onSelect: (date: string) => void;
}

/** The events behind the chart as a list, newest first, for scanning and keyboard access. */
export function EventLog({ events, activeCategories, onSelect }: EventLogProps) {
  const rows = events
    .filter((e) => activeCategories.has(e.category))
    .sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.score_impact) - Math.abs(a.score_impact));

  return (
    <section aria-labelledby="event-log-heading" className="space-y-3">
      <h2 id="event-log-heading" className="text-xs font-medium uppercase tracking-widest text-zinc-500">
        Events on the timeline
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No events match the selected types.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-md border border-zinc-800">
          {rows.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(event.date);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-3 px-4 py-3 text-left hover:bg-zinc-900"
              >
                <span className="font-mono text-xs text-zinc-500">{formatShortDate(event.date)}</span>
                <span className="flex min-w-0 items-baseline gap-2 text-sm text-zinc-200">
                  <span
                    className={`h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${CATEGORY_STYLES[event.category].swatch}`}
                    aria-hidden
                  />
                  <span className="sr-only">{CATEGORY_STYLES[event.category].label}: </span>
                  <span className="truncate">{event.title}</span>
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {event.score_impact === 0 ? "" : `${event.score_impact > 0 ? "+" : ""}${event.score_impact}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
