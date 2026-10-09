"use client";

import { useMemo } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { EventCategory, SignalEvent, SignalScore } from "@/types";
import { formatDate, formatShortDate } from "@/lib/dates";
import { CATEGORY_STYLES, leadEvent } from "@/lib/event-style";

interface TimelineChartProps {
  data: SignalScore[];
  events: SignalEvent[];
  activeCategories: Set<EventCategory>;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

interface ChartRow {
  date: string;
  score: number;
  lead?: SignalEvent;
  dayEvents: SignalEvent[];
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}

const SURFACE = "#09090B";

function niceMax(values: number[]): number {
  const max = Math.max(0, ...values);
  return Math.min(100, Math.max(25, Math.ceil((max * 1.2) / 25) * 25));
}

function TimelineTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="max-w-xs rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-zinc-400">{formatDate(row.date)}</span>
        <span className="font-mono font-medium text-zinc-50">{row.score.toFixed(1)}</span>
      </div>
      {row.dayEvents.slice(0, 3).map((event) => (
        <div key={event.id} className="mt-1.5 flex items-start gap-2 text-zinc-300">
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${CATEGORY_STYLES[event.category].swatch}`}
            aria-hidden
          />
          <span>
            <span className="text-zinc-500">{CATEGORY_STYLES[event.category].label}. </span>
            {event.title}
          </span>
        </div>
      ))}
      {row.dayEvents.length > 3 ? (
        <div className="mt-1 text-zinc-500">and {row.dayEvents.length - 3} more</div>
      ) : null}
    </div>
  );
}

export function TimelineChart({ data, events, activeCategories, selectedDate, onSelect }: TimelineChartProps) {
  const rows = useMemo<ChartRow[]>(() => {
    const byDate = new Map<string, SignalEvent[]>();
    for (const event of events) {
      if (!activeCategories.has(event.category)) continue;
      byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
    }
    return data.map((score) => {
      const dayEvents = byDate.get(score.date) ?? [];
      return { date: score.date, score: score.total_score, lead: leadEvent(dayEvents), dayEvents };
    });
  }, [data, events, activeCategories]);

  const yMax = niceMax(rows.map((r) => r.score));

  function renderDot({ cx, cy, payload }: DotProps) {
    if (cx === undefined || cy === undefined || !payload?.lead) return <g key={`empty-${payload?.date}`} />;
    const selected = payload.date === selectedDate;
    return (
      <g
        key={payload.date}
        className="cursor-pointer"
        data-date={payload.date}
        onClick={() => onSelect(payload.date)}
      >
        <circle cx={cx} cy={cy} r={7} fill="transparent" />
        <circle
          cx={cx}
          cy={cy}
          r={selected ? 7 : 5}
          fill={CATEGORY_STYLES[payload.lead.category].color}
          stroke={selected ? "#FAFAFA" : SURFACE}
          strokeWidth={2}
        />
      </g>
    );
  }

  return (
    <div className="h-[300px] w-full sm:h-[380px]" aria-label="Risk score over the last 90 days">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 12, right: 8, bottom: 4, left: -16 }}
          className="cursor-crosshair"
        >
          <CartesianGrid vertical={false} stroke="#27272A" strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fill: "#71717A", fontSize: 11 }}
            axisLine={{ stroke: "#3F3F46" }}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis
            domain={[0, yMax]}
            ticks={Array.from({ length: 6 }, (_, i) => (yMax / 5) * i)}
            tick={{ fill: "#71717A", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          {selectedDate ? <ReferenceLine x={selectedDate} stroke="#52525B" strokeDasharray="3 3" /> : null}
          <Tooltip
            content={TimelineTooltip}
            cursor={{ stroke: "#52525B", strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="score"
            stroke="#E4E4E7"
            strokeWidth={2}
            dot={renderDot}
            activeDot={(props: DotProps) => (
              <circle
                key={`active-${props.payload?.date}`}
                cx={props.cx}
                cy={props.cy}
                r={5}
                fill="#FAFAFA"
                stroke={SURFACE}
                strokeWidth={2}
                className="cursor-pointer"
                onClick={() => props.payload && onSelect(props.payload.date)}
              />
            )}
            isAnimationActive={false}
          />
          <Brush
            dataKey="date"
            height={22}
            stroke="#52525B"
            fill={SURFACE}
            travellerWidth={8}
            tickFormatter={formatShortDate}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
