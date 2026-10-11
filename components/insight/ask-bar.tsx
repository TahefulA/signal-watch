"use client";

import { type FormEvent, useState } from "react";
import type { AskAnswer, Entity } from "@/types";

interface AskBarProps {
  reportId: string;
  nodes: Entity[];
  onEntityClick: (id: string) => void;
  onCapitalClick: () => void;
}

const EXAMPLES = ["Who provides credit support for the leases?", "What is the leverage?", "What changed since last quarter?"];

/** Questions answered only from this report, with clickable citations. */
export function AskBar({ reportId, nodes, onEntityClick, onCapitalClick }: AskBarProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, question: q }),
      });
      const body = (await response.json()) as { answer?: AskAnswer; error?: string };
      if (!response.ok || !body.answer) throw new Error(body.error ?? "");
      setAnswer(body.answer);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The question could not be answered. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  const open = (id: string) => (id === "capital" ? onCapitalClick() : onEntityClick(id));

  return (
    <div>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="ask-input" className="sr-only">
          Ask a question about this company
        </label>
        <input
          id="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about this company..."
          disabled={busy}
          className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="shrink-0 rounded-sm border border-zinc-700 px-4 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-50"
        >
          {busy ? "Reading..." : "Ask"}
        </button>
      </form>
      {!answer && !busy ? (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          Try:
          {EXAMPLES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuestion(q);
                void ask(q);
              }}
              className="text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100"
            >
              {q}
            </button>
          ))}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {answer ? (
        <div className="mt-3 rounded-sm border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">{answer.question}</p>
          <p className={`mt-1 text-sm leading-relaxed ${answer.notFound ? "text-zinc-400" : "text-zinc-200"}`}>
            {answer.spans.map((s, i) =>
              s.entityId ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => open(s.entityId as string)}
                  className="text-zinc-50 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300"
                >
                  {s.text}
                </button>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
          {answer.citedIds.length ? (
            <div className="mt-2">
              {answer.citedIds.map((id) => {
                const node = nodes.find((n) => n.id === id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => open(id)}
                    title={node ? `"${node.sourceQuote}"` : "Capital structure panel"}
                    className="mr-2 mt-2 inline-block cursor-pointer rounded-sm bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    {node ? `${node.name} · ${node.sourceType}${node.sourcePage ? ` p. ${node.sourcePage}` : ""}` : "Capital structure"}
                  </button>
                );
              })}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-zinc-500">
            Answered from this report only.{answer.removed ? ` ${answer.removed} sentence${answer.removed > 1 ? "s" : ""} with figures not in the report removed.` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
