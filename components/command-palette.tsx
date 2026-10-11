"use client";

import { Search } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { AskAnswer, Entity } from "@/types";

interface CommandPaletteProps {
  open: boolean;
  reportId: string;
  ticker: string;
  nodes: Entity[];
  onClose: () => void;
  /** Opens an entity on the Graph tab. */
  onEntityClick: (id: string) => void;
  onCapitalClick: () => void;
}

const EXAMPLES = ["Who provides credit support for the leases?", "What is the leverage?", "What changed since last quarter?"];
const RECENT_KEY = "signal-watch:recent-questions";

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((q): q is string => typeof q === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(question: string) {
  try {
    const next = [question, ...readRecent().filter((q) => q !== question)].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recent questions are a convenience; ignore storage failures.
  }
}

/** ⌘K: questions answered only from this report, with the sources as clickable chips. */
export function CommandPalette({ open, reportId, ticker, nodes, onClose, onEntityClick, onCapitalClick }: CommandPaletteProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement;
    setRecent(readRecent());
    window.setTimeout(() => inputRef.current?.focus(), 0);
    const esc = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    setAnswer(null);
    setQuestion("");
  }, [reportId]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setQuestion(q);
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
      saveRecent(q);
      setRecent(readRecent());
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

  if (!open) return null;
  const go = (id: string) => {
    onClose();
    if (id === "capital") onCapitalClick();
    else onEntityClick(id);
  };
  const suggestions = recent.length ? recent : EXAMPLES;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[4px]" onMouseDown={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ask about ${ticker}`}
        onMouseDown={(e) => e.stopPropagation()}
        className="mx-auto mt-[20vh] w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900"
      >
        <form onSubmit={submit} className="flex h-14 items-center gap-3 border-b border-zinc-800 px-4">
          <Search className="h-[18px] w-[18px] shrink-0 text-zinc-500" aria-hidden />
          <label htmlFor="palette-input" className="sr-only">
            Ask a question about {ticker}
          </label>
          <input
            id="palette-input"
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask a question about ${ticker}...`}
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-zinc-50 placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="hidden rounded-xs border border-zinc-700 px-1.5 font-mono text-[10px] text-zinc-500 sm:inline">Esc</kbd>
        </form>

        {busy ? <p className="px-4 py-3 text-sm text-zinc-400">Thinking...</p> : null}
        {error ? (
          <p className="px-4 py-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {answer && !busy ? (
          <div className="border-b border-zinc-800 p-4">
            <p className="text-xs text-zinc-500">{answer.question}</p>
            <p className={`mt-1 text-sm leading-relaxed ${answer.notFound ? "text-zinc-400" : "text-zinc-200"}`}>
              {answer.spans.map((s, i) =>
                s.entityId ? (
                  <button key={i} type="button" onClick={() => go(s.entityId as string)} className="text-zinc-50 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300">
                    {s.text}
                  </button>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
            {answer.citedIds.length ? (
              <div className="mt-1">
                {answer.citedIds.map((id) => {
                  const node = nodes.find((n) => n.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => go(id)}
                      title={node ? `"${node.sourceQuote}"` : "Capital tab"}
                      className="mr-2 mt-2 inline-block rounded-xs bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
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

        {!busy ? (
          <div className="py-2">
            <p className="px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500">{recent.length ? "Recent" : "Try"}</p>
            <ul>
              {suggestions.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => void ask(q)} className="w-full px-4 py-3 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                    › {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
