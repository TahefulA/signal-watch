"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Bar, BarChart } from "recharts";

const AXIS = { stroke: "var(--chart-grid)", tick: { fill: "var(--chart-ink)", fontSize: 11 }, tickLine: false };
const TOOLTIP = {
  contentStyle: { background: "rgb(var(--zinc-950))", border: "1px solid rgb(var(--zinc-700))", borderRadius: 2, fontSize: 12, color: "rgb(var(--zinc-100))" },
  labelStyle: { color: "rgb(var(--zinc-300))" },
  cursor: { stroke: "rgb(var(--zinc-600))", strokeWidth: 1 },
};
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

export interface CalibrationBin {
  from: number;
  to: number;
  predicted: number;
  observed: number;
  rows: number;
  bankruptcies: number;
}

/** Predicted against observed bankruptcy rates per score bucket; on the diagonal means the model's odds can be taken at face value. */
export function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const top = Math.max(...bins.map((b) => Math.max(b.predicted, b.observed))) * 1.1;
  const data = bins.map((b) => ({ ...b, x: b.predicted, y: b.observed }));
  return (
    <div className="h-[300px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 16, bottom: 28, left: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" />
          <XAxis type="number" dataKey="x" domain={[0, top]} tickFormatter={(v: number) => pct(v, 0)} {...AXIS} label={{ value: "Predicted probability", position: "insideBottom", offset: -16, fill: "var(--chart-ink)", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, top]} tickFormatter={(v: number) => pct(v, 0)} {...AXIS} width={44} label={{ value: "Share that filed", angle: -90, position: "insideLeft", fill: "var(--chart-ink)", fontSize: 11 }} />
          <ZAxis range={[90, 90]} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: top, y: top }]} stroke="rgb(var(--zinc-500))" strokeDasharray="4 4" ifOverflow="hidden" />
          <Tooltip
            {...TOOLTIP}
            content={({ payload }) => {
              const b = payload?.[0]?.payload as (CalibrationBin & { x: number }) | undefined;
              if (!b) return null;
              return (
                <div style={TOOLTIP.contentStyle} className="px-3 py-2">
                  <p className="font-medium">Scores {pct(b.from, 1)} to {pct(b.to, 1)}</p>
                  <p>Predicted {pct(b.predicted, 2)} · filed {pct(b.observed, 2)}</p>
                  <p className="text-zinc-400">{b.rows.toLocaleString()} filings scored, {b.bankruptcies} followed by bankruptcy</p>
                </div>
              );
            }}
          />
          <Scatter isAnimationActive={false} data={data} fill="var(--series-1)" stroke="rgb(var(--zinc-950))" strokeWidth={2} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface YearRow {
  year: number;
  auc: number | null;
  aucLogit: number | null;
  aucZ: number | null;
}

/** How well each method ranked the year's bankruptcies above the rest, scored only on years after its training data. */
export function AucChart({ years }: { years: YearRow[] }) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer>
        <LineChart data={years} margin={{ top: 10, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="year" {...AXIS} />
          <YAxis domain={[0.5, 1]} {...AXIS} width={40} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip {...TOOLTIP} formatter={(v) => (typeof v === "number" ? v.toFixed(3) : String(v))} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--chart-ink)" }} iconType="plainline" />
          <Line isAnimationActive={false} type="linear" dataKey="auc" name="Signal Watch model" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--series-1)", stroke: "rgb(var(--zinc-950))" }} />
          <Line isAnimationActive={false} type="linear" dataKey="aucLogit" name="Logistic regression" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--series-2)", stroke: "rgb(var(--zinc-950))" }} />
          <Line isAnimationActive={false} type="linear" dataKey="aucZ" name="Altman Z''" stroke="var(--series-3)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--series-3)", stroke: "rgb(var(--zinc-950))" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bankruptcies caught, by how many months before the filing the warning started and stayed on. */
export function WarningChart({ bins }: { bins: { months: string; count: number }[] }) {
  return (
    <div className="h-[240px]">
      <ResponsiveContainer>
        <BarChart data={bins} margin={{ top: 10, right: 16, bottom: 20, left: 8 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="months" {...AXIS} label={{ value: "Months of warning before the filing", position: "insideBottom", offset: -10, fill: "var(--chart-ink)", fontSize: 11 }} />
          <YAxis allowDecimals={false} {...AXIS} width={36} />
          <Tooltip {...TOOLTIP} cursor={{ fill: "rgb(var(--zinc-800) / 0.4)" }} formatter={(v) => [`${v} bankruptcies`, "Caught"]} />
          <Bar isAnimationActive={false} dataKey="count" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
