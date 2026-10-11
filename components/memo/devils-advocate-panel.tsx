"use client";

import { ChevronDown, ExternalLink, Loader2, Sword } from "lucide-react";
import { useState } from "react";
import type { DevilsAdvocate, MemoSpan, PatternResult, PatternStatus } from "@/types";

interface DevilsAdvocatePanelProps {
  devil: DevilsAdvocate | null | undefined;
  busy: boolean;
  error: string | null;
  onRun: () => void;
  /** Opens an entity on the Graph tab. */
  onEntityClick: (id: string) => void;
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

/** Every pattern and its result, so the reader can see what was checked and what could not be. */
function PatternList({ patterns }: { patterns: PatternResult[] }) {
  const [open, setOpen] = useState(false);
  const counts = { fired: 0, clear: 0, not_evaluated: 0 };
  for (const p of patterns) counts[p.status]++;
  const order: PatternStatus[] = ["fired", "clear", "not_evaluated"];
  return (
    <div className="mt-6 border-t border-red-600/30 pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100" aria-expanded={open}>
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
                  <span className={`mr-2 font-mono text-[10px] uppercase tracking-wider ${p.status === "fired" ? "text-red-500" : p.status === "clear" ? "text-zinc-500" : "text-zinc-600"}`}>
                    {STATUS_WORD[p.status]}
                  </span>
                  <span className={p.status === "fired" ? "font-medium text-zinc-100" : "text-zinc-400"}>{p.name}</span>
                </p>
                <p className="text-zinc-500">{p.detail}</p>
                {p.status === "fired"
                  ? p.evidence.slice(0, 2).map((e, i) => (
                      <a key={i} href={e.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-zinc-500 hover:text-zinc-200">
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

/** Argues against the memo from the filings: the counter-argument, its citations and the patterns behind it. */
export function DevilsAdvocatePanel({ devil, busy, error, onRun, onEntityClick }: DevilsAdvocatePanelProps) {
  return (
    <section className="mt-10 border-t border-zinc-800 pt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Devil&rsquo;s advocate</h3>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xs bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sword className="h-3.5 w-3.5" aria-hidden />}
          {busy ? "Analyzing..." : devil ? "Argue again" : "Argue the opposite"}
        </button>
      </div>
      {error ? (
        <p className="mb-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {devil ? (
        <div className="rounded-xs border-2 border-red-600 p-6" style={{ background: "var(--devil-bg)" }}>
          <p className="text-xs uppercase tracking-widest text-red-500">The case against the memo</p>
          <p className="mt-3 text-base leading-relaxed text-zinc-200">
            <Argument spans={devil.argument} onEntityClick={onEntityClick} />
          </p>

          {devil.patternsUsed.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {devil.patternsUsed.map((name) => (
                <span key={name} className="rounded-xs border border-red-600/50 px-2 py-0.5 text-[11px] text-red-400">
                  {name}
                </span>
              ))}
            </div>
          ) : null}

          {devil.citations.length ? (
            <ol className="mt-5 space-y-2">
              {devil.citations.map((c, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-mono text-[11px] text-red-500">{i + 1}</span>
                  {c.entityId ? (
                    <button type="button" onClick={() => onEntityClick(c.entityId as string)} className="text-left text-zinc-200 hover:text-zinc-50" title={c.quote ?? undefined}>
                      {c.claim}
                    </button>
                  ) : (
                    <span className="text-zinc-200" title={c.quote ?? undefined}>
                      {c.claim}
                    </span>
                  )}
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-200">
                      {c.source} <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    <span className="font-mono text-[11px] text-zinc-500">{c.source}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : null}

          {devil.whatToWatch ? (
            <p className="mt-5 border-t border-red-600/30 pt-4 text-sm text-zinc-300">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-widest text-red-500">What to watch</span>
              {devil.whatToWatch}
            </p>
          ) : null}

          <PatternList patterns={devil.patterns} />
        </div>
      ) : (
        <p className="text-[15px] text-zinc-500">
          Gemini reads the memo, the map, the filing text and the results of 35 contradiction patterns, then argues against the thesis. Every figure must come from those sources.
        </p>
      )}
    </section>
  );
}
