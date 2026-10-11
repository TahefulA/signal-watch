"use client";

import { ExternalLink, Sword } from "lucide-react";
import type { ReactNode } from "react";
import type { CaseEvent, CaseSection, CaseStrength, DevilsAdvocate, Exhibit, MemoSpan } from "@/types";
import { PatternList } from "./counter-argument-column";

interface DevilsCaseProps {
  devil: DevilsAdvocate;
  /** Opens an entity on the Graph tab. */
  onEntityClick: (id: string) => void;
}

export const STRENGTH_STYLE: Record<CaseStrength, { word: string; className: string }> = {
  strong: { word: "Strong point", className: "border-red-600 text-red-500" },
  moderate: { word: "Moderate point", className: "border-amber-600 text-amber-500" },
  weak: { word: "Weak point", className: "border-zinc-600 text-zinc-500" },
};

const EVENT_WORD: Record<CaseEvent["kind"], string> = {
  filing: "Filing",
  "8-K": "8-K",
  insider: "Insider",
  maturity: "Debt due",
  entity: "Map",
  market: "Market",
};

export function Linked({ spans, onEntityClick }: { spans: MemoSpan[]; onEntityClick: (id: string) => void }) {
  return (
    <>
      {spans.map((s, i) =>
        s.entityId ? (
          <button
            key={i}
            type="button"
            onClick={() => onEntityClick(s.entityId as string)}
            className="text-zinc-50 underline decoration-red-600 decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            {s.text}
          </button>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{children}</p>;
}

function Block({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-zinc-800 pt-8">
      <h3 className="mb-5 text-[11px] font-semibold uppercase tracking-widest text-red-500">{title}</h3>
      {children}
    </section>
  );
}

export function ExhibitTable({ exhibit }: { exhibit: Exhibit }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-200">{exhibit.title}</span>
        {exhibit.source ? (
          <a
            href={exhibit.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-200"
          >
            {exhibit.source.label} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </figcaption>
      <div className="overflow-x-auto rounded-xs border border-zinc-800">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-zinc-900">
              {exhibit.columns.map((c) => (
                <th key={c} scope="col" className="whitespace-nowrap border-b border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exhibit.rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800 last:border-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 align-top ${j === 0 ? "text-zinc-200" : "font-mono text-zinc-300"} ${cell.length > 40 ? "min-w-[220px] font-sans" : "whitespace-nowrap"} ${/^-|^\+?-\d/.test(cell) ? "text-red-400" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {exhibit.note ? <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{exhibit.note}</p> : null}
    </figure>
  );
}

function Sources({ section, onEntityClick }: { section: CaseSection; onEntityClick: (id: string) => void }) {
  if (!section.citations.length) return null;
  return (
    <div>
      <Label>Sources</Label>
      <ul className="flex flex-wrap gap-2">
        {section.citations.map((c, i) => (
          <li key={i}>
            {c.entityId ? (
              <button
                type="button"
                onClick={() => onEntityClick(c.entityId as string)}
                title={c.quote ?? undefined}
                className="inline-flex items-center gap-1 rounded-xs border border-zinc-700 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
              >
                {c.source}
              </button>
            ) : c.url ? (
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                title={c.quote ?? undefined}
                className="inline-flex items-center gap-1 rounded-xs border border-zinc-700 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
              >
                {c.source} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : (
              <span className="inline-flex rounded-xs border border-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-400">{c.source}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionView({ section, n, onEntityClick }: { section: CaseSection; n: number; onEntityClick: (id: string) => void }) {
  const strength = STRENGTH_STYLE[section.strength];
  return (
    <article id={`case-${section.theme}`} className="scroll-mt-24 border-t border-zinc-800 pt-10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-red-500">{String(n).padStart(2, "0")}</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{section.themeLabel}</span>
        <span className={`rounded-xs border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${strength.className}`}>{strength.word}</span>
      </div>
      <h4 className="mt-3 max-w-4xl font-display text-xl font-semibold leading-snug text-zinc-50">{section.headline}</h4>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          {section.memoSays ? (
            <div className="border-l-2 border-zinc-700 pl-4">
              <Label>What the memo says</Label>
              <p className="text-sm italic leading-relaxed text-zinc-400">{section.memoSays}</p>
            </div>
          ) : null}
          <div>
            <Label>The counter-argument</Label>
            <p className="text-[15px] leading-[1.8] text-zinc-200">
              <Linked spans={section.argument} onEntityClick={onEntityClick} />
            </p>
          </div>
        </div>
        <div className="min-w-0 space-y-6">
          {section.plainEnglish ? (
            <div className="rounded-xs border border-zinc-800 bg-zinc-900 p-5">
              <Label>In plain English</Label>
              <p className="text-sm leading-relaxed text-zinc-200">{section.plainEnglish}</p>
            </div>
          ) : null}
          {section.whyItMatters ? (
            <div className="rounded-xs border border-red-600/50 p-5" style={{ background: "var(--devil-bg)" }}>
              <Label>Why it matters to a lender</Label>
              <p className="text-sm leading-relaxed text-zinc-100">{section.whyItMatters}</p>
            </div>
          ) : null}
          <Sources section={section} onEntityClick={onEntityClick} />
        </div>
      </div>

      {section.exhibits.length ? (
        <div className="mt-8 space-y-6">
          <Label>The evidence</Label>
          {section.exhibits.map((x) => (
            <ExhibitTable key={x.title} exhibit={x} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Timeline({ events, today }: { events: CaseEvent[]; today: string }) {
  return (
    <ol className="relative space-y-0 border-l border-zinc-800">
      {events.map((e, i) => {
        const upcoming = e.date > today;
        return (
          <li key={i} className="relative grid grid-cols-[96px_80px_minmax(0,1fr)] gap-3 py-2 pl-5 text-xs">
            <span
              className={`absolute -left-[4px] top-[13px] h-[7px] w-[7px] rounded-[1px] ${upcoming ? "border border-red-500 bg-zinc-950" : e.kind === "insider" || e.kind === "maturity" ? "bg-red-600" : "bg-zinc-500"}`}
              aria-hidden
            />
            <span className={`font-mono ${upcoming ? "text-red-400" : "text-zinc-400"}`}>{e.date}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              {upcoming ? "Upcoming" : EVENT_WORD[e.kind]}
              {e.quarter ? <span className="block font-mono normal-case tracking-normal text-zinc-600">{e.quarter}</span> : null}
            </span>
            {e.url ? (
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-zinc-200 hover:text-zinc-50 hover:underline">
                {e.text}
              </a>
            ) : (
              <span className="text-zinc-200">{e.text}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The full case against the memo, below the memo and its summary column. */
export function DevilsCase({ devil, onEntityClick }: DevilsCaseProps) {
  const sections = devil.sections ?? [];
  const period = devil.period;
  return (
    <div id="devils-case" className="mt-16 scroll-mt-24 space-y-10 border-t-2 border-red-600 pt-10">
      <header>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-red-500">
          <Sword className="h-3.5 w-3.5" aria-hidden /> Devil&rsquo;s advocate &middot; the full case against the memo
        </p>
        {period ? (
          <p className="mt-3 font-mono text-xs leading-relaxed text-zinc-400">
            Based on {period.quarter ?? (period.filed ? "the latest quarter" : "the period in the documents")}
            {period.periodEnd ? `, the quarter ended ${period.periodEnd}` : ""}
            {period.form ? ` · ${period.form}${period.filed ? ` filed ${period.filed}` : ""}` : ""}
            {period.daysSinceFiling !== null ? `, ${period.daysSinceFiling} days before this case was written on ${period.writtenOn}` : ""}
            {period.historySpan ? ` · trend tables cover ${period.historySpan}` : ""}
          </p>
        ) : null}
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Sections of the case">
          {sections.map((s, i) => (
            <a
              key={s.theme}
              href={`#case-${s.theme}`}
              className="rounded-xs border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
            >
              <span className="mr-1.5 font-mono text-red-500">{String(i + 1).padStart(2, "0")}</span>
              {s.themeLabel}
            </a>
          ))}
          {["timeline", "rebuttal", "watch", "glossary", "coverage"].map((id) => (
            <a key={id} href={`#case-${id}`} className="rounded-xs border border-zinc-800 px-2.5 py-1 text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-100">
              {{ timeline: "Timeline", rebuttal: "The other side", watch: "What to watch", glossary: "Terms", coverage: "What was read" }[id]}
            </a>
          ))}
        </nav>
      </header>

      {sections.map((s, i) => (
        <SectionView key={s.theme} section={s} n={i + 1} onEntityClick={onEntityClick} />
      ))}

      {devil.events?.length ? (
        <Block id="case-timeline" title="Timeline: what happened, and when">
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-zinc-400">
            Filings, 8-Ks, insider trades and debt due dates behind the case, oldest first. Dates after {devil.period?.writtenOn ?? "today"} are still to come.
          </p>
          <Timeline events={devil.events} today={devil.period?.writtenOn ?? devil.generatedAt.slice(0, 10)} />
        </Block>
      ) : null}

      {devil.rebuttal ? (
        <Block id="case-rebuttal" title="The other side: the best answer to this case">
          <p className="max-w-4xl text-[15px] leading-[1.8] text-zinc-300">{devil.rebuttal}</p>
        </Block>
      ) : null}

      {devil.watchList?.length ? (
        <Block id="case-watch" title="What to watch, and when">
          <div className="overflow-x-auto rounded-xs border border-zinc-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th scope="col" className="px-4 py-2 font-semibold">Check</th>
                  <th scope="col" className="px-4 py-2 font-semibold">When it will be known</th>
                  <th scope="col" className="px-4 py-2 font-semibold">What would confirm or weaken the case</th>
                </tr>
              </thead>
              <tbody>
                {devil.watchList.map((w, i) => (
                  <tr key={i} className="border-t border-zinc-800 align-top">
                    <td className="min-w-[200px] px-4 py-3 font-medium text-zinc-100">{w.item}</td>
                    <td className="min-w-[160px] px-4 py-3 font-mono text-xs text-zinc-300">{w.when}</td>
                    <td className="min-w-[240px] px-4 py-3 text-zinc-300">{w.signal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      ) : null}

      {devil.glossary?.length ? (
        <Block id="case-glossary" title="Terms used in this case">
          <dl className="grid gap-x-10 gap-y-4 md:grid-cols-2">
            {devil.glossary.map((g) => (
              <div key={g.term}>
                <dt className="text-sm font-medium text-zinc-100">{g.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-zinc-400">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </Block>
      ) : null}

      {devil.coverage?.length ? (
        <Block id="case-coverage" title="What was read, and what was not">
          <ul className="grid gap-x-10 gap-y-2 md:grid-cols-2">
            {devil.coverage.map((c) => (
              <li key={c.label} className="flex gap-3 text-sm">
                <span className={`mt-0.5 w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider ${c.read ? "text-emerald-500" : "text-zinc-600"}`}>
                  {c.read ? "Read" : "Not read"}
                </span>
                <span>
                  <span className="text-zinc-200">{c.label}</span>
                  <span className="block text-xs text-zinc-500">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {devil.removed > 0 ? (
            <p className="mt-4 text-xs text-zinc-500">
              {devil.removed} sentence{devil.removed === 1 ? " was" : "s were"} removed because {devil.removed === 1 ? "it" : "they"} used a figure that is not in the data.
            </p>
          ) : null}
          <div className="mt-6">
            <PatternList patterns={devil.patterns} />
          </div>
        </Block>
      ) : null}
    </div>
  );
}
