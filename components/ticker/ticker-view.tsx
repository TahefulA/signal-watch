"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { ComponentKey, EventCategory, SignalEvent, TickerDataset } from "@/types";
import { formatDate } from "@/lib/dates";
import { CATEGORY_ORDER } from "@/lib/event-style";
import { DecompositionPanel } from "./decomposition-panel";
import { EventLog } from "./event-log";
import { FilterButtons } from "./filter-buttons";
import { SourceDrawer } from "./source-drawer";
import { TimelineChart } from "./timeline-chart";

function headline(dataset: TickerDataset): string {
  const latest = dataset.scores.at(-1);
  const weekAgo = dataset.scores.at(-8);
  if (!latest) return `${dataset.profile.name} has no scores yet.`;
  const base = `${dataset.profile.name} scores ${latest.total_score.toFixed(1)} today`;
  if (!weekAgo) return `${base}.`;
  const change = latest.total_score - weekAgo.total_score;
  if (Math.abs(change) < 0.05) return `${base}, unchanged from a week ago.`;
  return `${base}, ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)} from a week ago.`;
}

export function TickerView({ dataset }: { dataset: TickerDataset }) {
  const { profile, scores, events } = dataset;
  const windowStart = scores[0]?.date ?? "";
  const timelineEvents = useMemo(() => events.filter((e) => e.date >= windowStart), [events, windowStart]);

  const [active, setActive] = useState<Set<EventCategory>>(() => new Set(CATEGORY_ORDER));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drawerComponent, setDrawerComponent] = useState<ComponentKey | null>(null);

  const counts = useMemo(() => {
    const result = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<EventCategory, number>;
    for (const e of timelineEvents) result[e.category] += 1;
    return result;
  }, [timelineEvents]);

  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const selectedIndex = selectedDate ? scores.findIndex((s) => s.date === selectedDate) : -1;
  const selected = selectedIndex >= 0 ? scores[selectedIndex] : null;
  const previous = selectedIndex > 0 ? scores[selectedIndex - 1] : null;

  const drawerEvents = useMemo<SignalEvent[]>(() => {
    if (!selected || !drawerComponent) return [];
    return selected.drivers[drawerComponent]
      .map((id) => eventsById.get(id))
      .filter((e): e is SignalEvent => e !== undefined)
      .sort((a, b) => Math.abs(b.score_impact) - Math.abs(a.score_impact) || b.date.localeCompare(a.date));
  }, [selected, drawerComponent, eventsById]);

  const toggle = useCallback((category: EventCategory) => {
    setActive((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const closeDrawer = useCallback(() => setDrawerComponent(null), []);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-50"
        >
          <ArrowLeft className="h-4 w-4 text-zinc-500" aria-hidden />
          All companies
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-sm font-medium text-zinc-400">{profile.ticker}</span>
          <span className="text-sm text-zinc-500">
            {profile.sector}, compared with {profile.sector_etf}
          </span>
        </div>
        <h1 className="max-w-3xl font-display text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          {headline(dataset)}
        </h1>
        <p className="max-w-3xl text-sm text-zinc-400">{dataset.reason}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Risk score, last 90 days</h2>
            <p className="text-xs text-zinc-500">Higher means more concern. Drag the handles below the chart to zoom.</p>
          </div>
          <FilterButtons active={active} counts={counts} onToggle={toggle} />
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 sm:p-5">
            <TimelineChart
              data={scores}
              events={timelineEvents}
              activeCategories={active}
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
            />
          </div>
        </div>

        <div className="min-w-0 lg:pt-[4.25rem]">
          {selected ? (
            <DecompositionPanel
              score={selected}
              previous={previous}
              activeComponent={drawerComponent}
              onBarClick={setDrawerComponent}
              onClose={() => {
                setSelectedDate(null);
                setDrawerComponent(null);
              }}
            />
          ) : (
            <div className="rounded-md border border-dashed border-zinc-800 p-5 text-sm text-zinc-400">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Score breakdown</p>
              <p className="mt-3">
                Select a day on the chart to see how filings, insiders, news and the market each contributed to the
                score.
              </p>
            </div>
          )}
        </div>
      </div>

      <EventLog events={timelineEvents} activeCategories={active} onSelect={setSelectedDate} />

      <SourceDrawer
        open={drawerComponent !== null && selected !== null}
        component={drawerComponent}
        date={selected?.date ?? null}
        events={drawerEvents}
        onClose={closeDrawer}
      />
      <p className="sr-only">Last updated {formatDate(scores.at(-1)?.date ?? windowStart)}.</p>
    </div>
  );
}
