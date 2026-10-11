"use client";

import { useState } from "react";
import type { ChangeKind, EntityDiff, Report, Timeline } from "@/types";
import { Button } from "@/components/ui/button";
import { CitationBlock } from "@/components/ui/citation";
import { TYPE_LABELS } from "@/lib/entity-style";
import { relationText } from "@/lib/node-visuals";
import { changesItems, sectionItems } from "@/lib/counter-view";
import { CounterArgumentsCard } from "./counter-arguments-card";
import { TabHeader } from "./financial-tab";
import { ForecastPanel } from "@/components/forecast/forecast-panel";

const GROUPS: { title: string; kinds: ChangeKind[]; color: string; bar: string }[] = [
  { title: "New entities", kinds: ["new", "new_debt"], color: "text-emerald-600", bar: "bg-emerald-600" },
  { title: "Changed entities", kinds: ["magnitude", "debt_amount"], color: "text-amber-600", bar: "bg-amber-600" },
  { title: "Removed entities", kinds: ["removed", "repaid_debt"], color: "text-red-600", bar: "bg-red-600" },
];

interface ChangesTabProps {
  report: Report;
  busy: boolean;
  step: string | null;
  error: string | null;
  onCompare: () => void;
  onSelectEntity: (id: string) => void;
  timeline: Timeline | null;
  devilBusy?: boolean;
}

/**
 * Every periodic filing as a dot. Selecting one lists the entities on today's
 * map that its filing names for the first time, and those the previous filing
 * named but this one does not. Mentions only: the full comparison below covers
 * the latest quarter.
 */
function ChangesTimeline({ report, timeline, onSelectEntity }: { report: Report; timeline: Timeline; onSelectEntity: (id: string) => void }) {
  const q = timeline.quarters;
  const [selected, setSelected] = useState(q.length - 1);
  const nodes = report.graph.nodes.filter((n) => !n.isCentral);
  const first = (id: string) => timeline.presence[id]?.findIndex(Boolean) ?? -1;
  const firstNamed = nodes.filter((n) => first(n.id) === selected);
  const dropped = selected > 0 ? nodes.filter((n) => timeline.presence[n.id]?.[selected - 1] && !timeline.presence[n.id]?.[selected]) : [];
  const counts = q.map((_, i) => nodes.filter((n) => first(n.id) === i).length);
  const at = (i: number) => (q.length <= 1 ? 50 : (i / (q.length - 1)) * 100);
  const name = (id: string, label: string) => (
    <button key={id} type="button" onClick={() => onSelectEntity(id)} className="text-zinc-100 underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-400">
      {label}
    </button>
  );
  return (
    <section className="mb-10 rounded-xs border border-zinc-800 bg-zinc-900 px-5 py-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Changes timeline</h3>
      <div className="relative mx-4 mt-6 h-6">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-700" aria-hidden />
        {q.map((quarter, i) => (
          <button
            key={quarter.label}
            type="button"
            onClick={() => setSelected(i)}
            aria-pressed={selected === i}
            title={`${quarter.label}: ${counts[i]} entities on today's map first named in this ${quarter.form}`}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${selected === i ? "h-3.5 w-3.5 border-red-600 bg-red-600" : counts[i] ? "h-2.5 w-2.5 border-zinc-300 bg-zinc-300" : "h-2.5 w-2.5 border-zinc-600 bg-zinc-900"}`}
            style={{ left: `${at(i)}%` }}
          />
        ))}
      </div>
      <div className="relative mx-4 h-4">
        {q.map((quarter, i) =>
          (q.length - 1 - i) % 2 === 0 || i === selected ? (
            <span key={quarter.label} className={`absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] ${i === selected ? "text-zinc-100" : "text-zinc-500"}`} style={{ left: `${at(i)}%` }}>
              {quarter.label}
            </span>
          ) : null,
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
            First named in the {q[selected].label} {q[selected].form} ({firstNamed.length})
          </p>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {firstNamed.length ? firstNamed.map((n, i) => <span key={n.id}>{i ? ", " : ""}{name(n.id, n.name)}</span>) : "None of today's entities."}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
            Named the filing before, not in this one ({dropped.length})
          </p>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {selected === 0 ? "No earlier filing in the timeline." : dropped.length ? dropped.map((n, i) => <span key={n.id}>{i ? ", " : ""}{name(n.id, n.name)}</span>) : "None."}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        From a search of each filing&rsquo;s text for today&rsquo;s entities. Risk factors are printed in full mostly in 10-Ks, so risks often show only in FY filings.
      </p>
    </section>
  );
}

function ChangeCard({ diff, report, bar, onSelectEntity }: { diff: EntityDiff; report: Report; bar: string; onSelectEntity: (id: string) => void }) {
  const entity = diff.entityId ? report.graph.nodes.find((n) => n.id === diff.entityId) : undefined;
  const latest = diff.citations[diff.citations.length - 1];
  return (
    <li className="relative mb-3 rounded-xs border border-zinc-800 bg-zinc-900 py-4 pl-5 pr-4">
      <span className={`absolute inset-y-0 left-0 w-1 rounded-l-xs ${bar}`} aria-hidden />
      {diff.entityId ? (
        <button type="button" onClick={() => onSelectEntity(diff.entityId as string)} className="text-sm font-semibold text-zinc-50 underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-400">
          {diff.name}
        </button>
      ) : (
        <p className="text-sm font-semibold text-zinc-50">{diff.name}</p>
      )}
      <p className="mt-1 text-xs text-zinc-400">
        {entity ? `${TYPE_LABELS[entity.type]} · ${relationText(entity)} · ` : diff.kind.includes("debt") ? "Debt · " : ""}
        {diff.detail}
        {diff.before || diff.after ? (
          <span className="ml-1 font-mono text-zinc-300">
            {diff.before ?? "none"} → {diff.after ?? "none"}
          </span>
        ) : null}
      </p>
      {latest ? (
        <p className="mt-2 font-mono text-[11px] text-zinc-600">
          {latest.sourceType} · {latest.sourceDate}
          {latest.page ? ` · p.${latest.page}` : ""}
        </p>
      ) : null}
      {diff.citations.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-[11px] text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200">Evidence</summary>
          {diff.citations.map((c) => (
            <CitationBlock key={`${c.sourceDate}-${c.quote}`} citation={c} compact />
          ))}
        </details>
      ) : null}
    </li>
  );
}

/** What the newest filings added, changed or dropped compared with the previous quarter's. */
export function ChangesTab({ report, busy, step, error, onCompare, onSelectEntity, timeline, devilBusy = false }: ChangesTabProps) {
  const counterCard = (
    <CounterArgumentsCard
      title="what changed for the worse"
      items={[...sectionItems(report.devil, ["changes", "behavior"]), ...changesItems(report.devil, report)]}
      busy={devilBusy}
      empty={report.devil ? "No new risk language, insider selling cluster, officer departures, auditor change or new debt was found." : "The counter-argument has not been written yet."}
    />
  );
  const forecastBlock = <ForecastPanel report={report} timeline={timeline} />;
  const timelineBlock = timeline && timeline.quarters.length ? <ChangesTimeline report={report} timeline={timeline} onSelectEntity={onSelectEntity} /> : null;
  const changes = report.changes;
  const describe = (docs: { sourceType: string; date: string; fiscalPeriod?: string | null }[]) =>
    docs
      .filter((d) => d.sourceType !== "News")
      .map((d) => `${d.sourceType}${d.fiscalPeriod ? ` ${d.fiscalPeriod}` : ""} (filed ${d.date})`)
      .join(", ");

  if (!changes) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-8 lg:px-12">
        <TabHeader title="Changes since last filing" />
        {counterCard}
        {forecastBlock}
        {timelineBlock}
        <p className="text-sm text-zinc-400">
          {busy
            ? (step ?? "Reading the previous quarter's filings...")
            : "Rebuild the map from the filings available the day before the newest 10-Q or 10-K, then compare. Takes about a minute."}
        </p>
        {!busy ? (
          <Button onClick={onCompare} variant="primary" className="mt-4">
            Compare with previous quarter
          </Button>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const facts = changes.changes.filter((c) => !c.judgment);
  const judgments = changes.changes.filter((c) => c.judgment);
  return (
    <div className="mx-auto max-w-[1000px] px-6 py-8 lg:px-12">
      <div className="mb-6 border-b border-zinc-800 pb-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Changes since last filing</h2>
        <p className="mt-2 font-mono text-xs text-zinc-500">
          {describe(changes.baselineFilings)} → {describe(changes.newFilings) || "no new filings"}
        </p>
      </div>
      {counterCard}
      {forecastBlock}
      {timelineBlock}
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Latest quarter, full comparison</h3>

      {facts.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No changes detected since last filing.</p>
      ) : (
        GROUPS.map((g) => {
          const items = facts.filter((c) => g.kinds.includes(c.kind));
          return (
            <section key={g.title} className="mt-8 first:mt-0">
              <h3 className={`mb-4 text-[11px] font-semibold uppercase tracking-wider ${g.color}`}>
                {g.title} ({items.length})
              </h3>
              {items.length ? (
                <ul>
                  {items.map((d) => (
                    <ChangeCard key={`${d.kind}-${d.name}`} diff={d} report={report} bar={g.bar} onSelectEntity={onSelectEntity} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-600">None</p>
              )}
            </section>
          );
        })
      )}

      {judgments.length || changes.mentionedBefore.length ? (
        <div className="mt-10 space-y-2 border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-500">
          {judgments.length ? (
            <p>Gemini&rsquo;s reading also changed for {judgments.map((j) => j.name).join(", ")}. These are ratings, not filing facts, so they are not marked on the map.</p>
          ) : null}
          {changes.mentionedBefore.length ? <p>Mapped only this time but already disclosed before, so not marked new: {changes.mentionedBefore.join(", ")}.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
