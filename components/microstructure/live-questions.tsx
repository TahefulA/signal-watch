"use client";

import { ChevronDown, MessageSquareText, X } from "lucide-react";
import { useState } from "react";
import type { RuleRunner } from "@/lib/alerts/engine";
import { type AlertRule, describeClause } from "@/lib/alerts/predicate";
import ev from "@/model/alert-compiler-eval.json";

export interface LiveQuestion {
  id: string;
  question: string;
  rule: AlertRule;
  description: string;
}

const EXAMPLES = [
  "Tell me if the price starts falling sharply",
  "Alert me on any unusually large trade",
  "Alert if the price is drifting up while the spread stays under 2 cents",
  "Tell me if a whale buys and the price jumps 3 cents in 5 minutes",
];

function fmt(metric: string, v: number | null): string {
  if (v === null) return "n/a";
  if (metric === "mid" || metric === "spread") return `${(v * 100).toFixed(1)}¢`;
  if (metric === "imbalance") return v.toFixed(2);
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Live questions: plain English in, a checked rule out, run by code on every
 * sample of the stream above. The model is called once per question and never
 * sees the feed.
 */
export function LiveQuestions({ questions, runners, onAdd, onRemove }: { questions: LiveQuestion[]; runners: Map<string, RuleRunner>; onAdd: (q: LiveQuestion) => void; onRemove: (id: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ reason: string; errors: string[]; unsupported: boolean } | null>(null);
  const [showJson, setShowJson] = useState<string | null>(null);

  const compile = async (q: string) => {
    const question = q.trim();
    if (question.length < 8 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/alerts/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const body = (await r.json()) as { rule?: AlertRule; description?: string; error?: string; errors?: string[]; unsupported?: boolean };
      if (!r.ok || !body.rule || !body.description) {
        setError({ reason: body.error ?? "The question could not be compiled.", errors: body.errors ?? [], unsupported: Boolean(body.unsupported) });
        return;
      }
      onAdd({ id: `${Date.now()}`, question, rule: body.rule, description: body.description });
      setText("");
    } catch {
      setError({ reason: "The question could not be compiled.", errors: [], unsupported: false });
    } finally {
      setBusy(false);
    }
  };

  const s = ev.summary;
  return (
    <section className="surface mt-6 rounded-xs border border-zinc-800 p-4" aria-label="Live questions">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
        <MessageSquareText className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Live questions
      </h2>
      <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-zinc-400">
        Ask about this order book in plain English. The AI compiles the question once into a rule, code validates every field, and then only code runs it on each one-second sample.
        The AI never sees the feed, so it cannot put a number into an alert.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void compile(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          maxLength={400}
          placeholder='e.g. "Alert me if the price drifts down while the spread stays tight"'
          className="min-w-0 flex-1 rounded-xs border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          aria-label="Live question"
        />
        <button type="submit" disabled={busy || text.trim().length < 8} className="rounded-xs border border-emerald-700 px-3 text-xs text-emerald-400 hover:border-emerald-500 disabled:opacity-40">
          {busy ? "Compiling" : "Compile"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((x) => (
          <button key={x} type="button" disabled={busy} onClick={() => void compile(x)} className="rounded-xs border border-zinc-800 px-2 py-1 text-left text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-40">
            {x}
          </button>
        ))}
      </div>
      {error ? (
        <div className="mt-3 rounded-xs border border-amber-800/70 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-300" role="alert">
          {error.unsupported ? "Not something one order book can answer: " : ""}
          {error.reason}
          {error.errors.length ? (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-400/80">
              {error.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {questions.length ? (
        <ul className="mt-4 space-y-2">
          {questions.map((q) => {
            const runner = runners.get(q.id);
            const status = runner?.status() ?? [];
            const fires = runner?.fires ?? [];
            const held = fires.filter((f) => f.outcome === "held").length;
            const reversed = fires.filter((f) => f.outcome === "reversed").length;
            const progress = runner ? Math.min(1, runner.progress / q.rule.persistence) : 0;
            return (
              <li key={q.id} className="rounded-xs border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-zinc-100">{q.rule.name}</p>
                    <p className="mt-0.5 text-[11px] italic text-zinc-500">&ldquo;{q.question}&rdquo;</p>
                  </div>
                  <span className={`shrink-0 rounded-xs border px-1.5 py-0.5 font-mono text-[10px] ${fires.length ? "border-emerald-700 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}>
                    fired {fires.length}
                  </span>
                  <button type="button" onClick={() => onRemove(q.id)} className="shrink-0 text-zinc-500 hover:text-zinc-200" aria-label={`Remove ${q.rule.name}`}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {q.rule.clauses.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12px]">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${status[i]?.holds ? "bg-emerald-500" : "bg-zinc-700"}`} aria-label={status[i]?.holds ? "Holds now" : "Does not hold now"} />
                      <span className="min-w-0 flex-1 text-zinc-300">{describeClause(c)}</span>
                      <span className="shrink-0 font-mono text-[11px] text-zinc-500">now {fmt(c.metric, status[i]?.value ?? null)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    held for
                    <span className="inline-block h-1.5 w-16 rounded-[2px] bg-zinc-800">
                      <span className="block h-full rounded-[2px] bg-emerald-600" style={{ width: `${progress * 100}%` }} />
                    </span>
                    <span className="font-mono">
                      {runner?.progress ?? 0}/{q.rule.persistence}s
                    </span>
                  </span>
                  <span>cooldown {q.rule.cooldownSec}s</span>
                  {held + reversed ? (
                    <span>
                      after 5 min: <span className="text-zinc-300">{held} held</span> · <span className={reversed ? "text-amber-400" : "text-zinc-300"}>{reversed} reversed</span>
                    </span>
                  ) : null}
                  <button type="button" onClick={() => setShowJson((id) => (id === q.id ? null : q.id))} className="inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-100" aria-expanded={showJson === q.id}>
                    compiled rule <ChevronDown className={`h-3 w-3 ${showJson === q.id ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                </div>
                {showJson === q.id ? <pre className="mt-2 overflow-x-auto rounded-xs bg-zinc-950 p-2 font-mono text-[10.5px] leading-relaxed text-zinc-400">{JSON.stringify(q.rule, null, 2)}</pre> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-4 border-t border-zinc-800 pt-2 text-[11px] leading-relaxed text-zinc-500">
        Compiler eval (scripts/eval-alert-compiler.ts, {s.ranAt.slice(0, 10)}): {s.correct} of {s.cases} questions compiled to the right rule or correctly refused. {s.compiledValid} of {s.compilable} answerable questions passed validation,
        and {s.refusedCorrectly} of {s.refusals} out-of-scope ones (news, other assets, time of day) were refused rather than approximated. Median compile {(s.medianCompileMs / 1000).toFixed(1)}s, once per question. Each rule then costs about {Math.round(s.meanEvalUs)}µs per sample.
        &ldquo;Reversed&rdquo; means that five minutes after a fire, the price had moved more than half a cent against the direction the rule named. Held includes a price that did not move.
      </p>
    </section>
  );
}
