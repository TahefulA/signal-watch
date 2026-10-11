"use client";

import { ChevronDown, ExternalLink, Loader2, Sword } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { DevilsAdvocate, MemoSpan, PatternResult, PatternStatus } from "@/types";
import { STRENGTH_STYLE } from "./devils-case";

interface CounterArgumentColumnProps {
  devil: DevilsAdvocate | null | undefined;
  busy: boolean;
  error: string | null;
  onRun: () => void;
  /** Opens an entity on the Graph tab. */
  onEntityClick: (id: string) => void;
  /** Text before a case exists, for pages that read other sources than SEC filings. */
  notes?: { busy: string; idle: string };
}

const STATUS_WORD: Record<PatternStatus, string> = { fired: "Fired", clear: "Clear", not_evaluated: "Not evaluated" };

function Argument({ spans, onEntityClick }: { spans: MemoSpan[]; onEntityClick: (id: string) => void }) {
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-800 pt-4">
      <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-red-500">{title}</h4>
      {children}
    </section>
  );
}

/** Every pattern and its result, so the reader can see what was checked and what could not be. */
export function PatternList({ patterns }: { patterns: PatternResult[] }) {
  const [open, setOpen] = useState(false);
  const counts = { fired: 0, clear: 0, not_evaluated: 0 };
  for (const p of patterns) counts[p.status]++;
  const order: PatternStatus[] = ["fired", "clear", "not_evaluated"];
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100"
        aria-expanded={open}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden />
        {patterns.length} patterns checked: {counts.fired} fired, {counts.clear} clear, {counts.not_evaluated} not evaluated
      </button>
      {open ? (
        <ul className="mt-3 space-y-3">
          {[...patterns]
            .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
            .map((p) => (
              <li key={p.id} className="text-xs leading-relaxed">
                <p>
                  <span
                    className={`mr-2 font-mono text-[10px] uppercase tracking-wider ${p.status === "fired" ? "text-red-500" : p.status === "clear" ? "text-zinc-500" : "text-zinc-600"}`}
                  >
                    {STATUS_WORD[p.status]}
                  </span>
                  <span className={p.status === "fired" ? "font-medium text-zinc-100" : "text-zinc-400"}>{p.name}</span>
                </p>
                <p className="text-zinc-500">{p.detail}</p>
                {p.status === "fired"
                  ? p.evidence.slice(0, 2).map((e, i) => !e.url ? (
                      <p key={i} className="mt-1 text-zinc-500">
                        {e.quote ? <span className="italic">&ldquo;{e.quote}&rdquo; </span> : null}
                        <span className="font-mono text-[10px]">{e.label}</span>
                      </p>
                    ) : (
                      <a
                        key={i}
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-zinc-500 hover:text-zinc-200"
                      >
                        {e.quote ? <span className="italic">&ldquo;{e.quote}&rdquo; </span> : null}
                        <span className="font-mono text-[10px] not-italic">{e.label}</span>
                      </a>
                    ))
                  : null}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Beside the memo: the case in short, with links down to each section of the full case. */
function StructuredSummary({ devil, onEntityClick }: { devil: DevilsAdvocate; onEntityClick: (id: string) => void }) {
  const sections = devil.sections ?? [];
  const period = devil.period;
  return (
    <>
      {period?.quarter ? (
        <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
          {period.quarter}
          {period.periodEnd ? ` · quarter ended ${period.periodEnd}` : ""}
          {period.form && period.filed ? ` · ${period.form} filed ${period.filed}` : ""}
          {period.daysSinceFiling !== null ? ` · ${period.daysSinceFiling} days old` : ""}
        </p>
      ) : null}

      {devil.primer ? (
        <Section title="Read this first">
          <p className="text-sm leading-relaxed text-zinc-300">{devil.primer}</p>
        </Section>
      ) : null}

      <Section title="Bottom line">
        <p className="text-[15px] leading-relaxed text-zinc-100">
          <Argument spans={devil.bottomLine ?? devil.argument} onEntityClick={onEntityClick} />
        </p>
      </Section>

      <Section title={`The case, point by point (${sections.length})`}>
        <ol className="space-y-3">
          {sections.map((s, i) => (
            <li key={s.theme}>
              <a href={`#case-${s.theme}`} className="group block">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-red-500">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">{s.themeLabel}</span>
                  <span className={`rounded-xs border px-1.5 text-[9px] uppercase tracking-wider ${STRENGTH_STYLE[s.strength].className}`}>{s.strength}</span>
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-zinc-200 group-hover:text-zinc-50 group-hover:underline">{s.headline}</span>
              </a>
            </li>
          ))}
        </ol>
      </Section>

      {devil.watchList?.length ? (
        <Section title="What to watch">
          <ul className="space-y-2">
            {devil.watchList.slice(0, 3).map((w, i) => (
              <li key={i} className="text-[13px] leading-snug text-zinc-200">
                {w.item}
                <span className="block font-mono text-[11px] text-zinc-500">{w.when}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <a
        href="#devils-case"
        className="inline-flex items-center gap-1.5 rounded-xs border border-red-600 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-600 hover:text-white"
      >
        Read the full case, with the evidence tables &darr;
      </a>
    </>
  );
}

/** The right column of the memo: the case against it, always beside the memo. */
export function CounterArgumentColumn({ devil, busy, error, onRun, onEntityClick, notes }: CounterArgumentColumnProps) {
  const fired = devil?.patterns.filter((p) => p.status === "fired") ?? [];
  return (
    <aside className="counter-column space-y-5 border-l-2 border-red-600 pl-5" aria-label="Devil's advocate">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-red-500">
          <Sword className="h-3.5 w-3.5" aria-hidden /> Devil&rsquo;s advocate
        </p>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xs border border-red-600 px-2.5 py-1 text-xs font-medium text-red-500 transition-colors duration-100 ease-out hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sword className="h-3 w-3" aria-hidden />}
          {busy ? "Analyzing..." : devil ? "Argue again" : "Argue the opposite"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {!devil ? (
        <p className="font-mono text-xs text-zinc-500">
          {notes
            ? busy
              ? notes.busy
              : notes.idle
            : busy
            ? "Analyzing... Reading the filings, Form 4s and XBRL facts, building the quarter-by-quarter tables and checking 36 contradiction patterns. The full case takes about a minute."
            : "The case against the memo is written from the memo, the map, the quarterly figures, the debt, changes, insider trades, 8-Ks, peers, market data, the filing text and 36 contradiction patterns. Every figure must come from those sources."}
        </p>
      ) : devil.sections ? (
        <StructuredSummary devil={devil} onEntityClick={onEntityClick} />
      ) : (
        <>
          <Section title="Counter-argument">
            <p className="text-[15px] leading-relaxed text-zinc-200">
              <Argument spans={devil.argument} onEntityClick={onEntityClick} />
            </p>
          </Section>

          {devil.whatToWatch ? (
            <Section title="What to watch">
              <p className="text-sm font-medium italic text-zinc-50">{devil.whatToWatch}</p>
            </Section>
          ) : null}

          <Section title={`Patterns fired (${fired.length})`}>
            {fired.length ? (
              <div className="flex flex-wrap gap-1.5">
                {fired.map((p) => (
                  <span
                    key={p.id}
                    title={p.detail}
                    className={`rounded-xs border px-2 py-0.5 text-[11px] ${devil.patternsUsed.includes(p.name) ? "border-red-600 text-zinc-50" : "border-red-600/40 text-zinc-400"}`}
                    style={{ background: "var(--devil-bg)" }}
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">None of the 36 patterns fired on this company&rsquo;s data.</p>
            )}
          </Section>

          {devil.citations.length ? (
            <Section title={`Citations (${devil.citations.length})`}>
              <ol className="space-y-2">
                {devil.citations.map((c, i) => (
                  <li key={i} className="text-[13px] leading-snug">
                    <span className="mr-2 font-mono text-[11px] text-red-500">{i + 1}</span>
                    {c.entityId ? (
                      <button
                        type="button"
                        onClick={() => onEntityClick(c.entityId as string)}
                        className="text-left text-zinc-200 hover:text-zinc-50"
                        title={c.quote ?? undefined}
                      >
                        {c.claim}
                      </button>
                    ) : (
                      <span className="text-zinc-200" title={c.quote ?? undefined}>
                        {c.claim}
                      </span>
                    )}
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-6 mt-0.5 flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-100"
                      >
                        {c.source} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <span className="ml-6 mt-0.5 block font-mono text-xs text-zinc-400">{c.source}</span>
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          <Section title="Every check">
            <PatternList patterns={devil.patterns} />
          </Section>
        </>
      )}
    </aside>
  );
}
