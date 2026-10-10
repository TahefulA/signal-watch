"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { WatchCard } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";

function ago(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function Card({ card, onRemove }: { card: WatchCard; onRemove: (ticker: string) => void }) {
  const alert = card.newFilings.length > 0;
  return (
    <article className={`flex flex-col border p-5 ${alert ? "border-amber-600" : "border-zinc-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-zinc-400">{card.ticker}</p>
          <h2 className="truncate font-display text-base font-bold text-zinc-100">{card.name ?? card.ticker}</h2>
        </div>
        <button type="button" onClick={() => onRemove(card.ticker)} className="text-xs text-zinc-500 hover:text-zinc-200" aria-label={`Remove ${card.ticker}`}>
          Remove
        </button>
      </div>

      {alert ? (
        <div className="mt-3 border-l-2 border-amber-600 pl-3 text-sm text-zinc-200">
          <p className="font-medium">New filing{card.newFilings.length > 1 ? "s" : ""} since the last report</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-zinc-400">
            {card.newFilings.map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100">
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {card.reportId ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-[11px] text-zinc-500">Total debt</dt>
              <dd className="font-mono text-zinc-100">{card.totalDebt ?? "n/a"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">Cash + revolver</dt>
              <dd className="font-mono text-zinc-100">{card.liquidity ?? "n/a"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">EBITDA, 12 months</dt>
              <dd className="font-mono text-zinc-100">{card.ebitda ?? "n/a"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">90-day price change</dt>
              <dd className="font-mono text-zinc-100">{card.return90d !== null ? `${(card.return90d * 100).toFixed(1)}%` : "n/a"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-zinc-400">
            {card.entityCount} entities{card.highSeverity.length > 0 ? `; high severity: ${card.highSeverity.slice(0, 3).join(", ")}${card.highSeverity.length > 3 ? "…" : ""}` : ""}
          </p>
          {card.changeCounts ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                {card.changeCounts.new} new
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                {card.changeCounts.changed} changed
              </span>
              <span>{card.changeCounts.removed} gone since the previous quarter</span>
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
            <Link href={`/?report=${card.reportId}`} className="text-sm text-zinc-100 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300">
              Open map
            </Link>
            {alert ? (
              <Link href={`/?ticker=${card.ticker}&fresh=1`} className="text-sm text-zinc-100 underline decoration-amber-600 underline-offset-4">
                Read the new filings
              </Link>
            ) : null}
            <span className="ml-auto font-mono text-[10px] text-zinc-500">Report {card.generatedAt ? ago(card.generatedAt) : ""}</span>
          </div>
        </>
      ) : (
        <div className="mt-auto pt-4">
          <p className="text-sm text-zinc-500">Not analyzed yet.</p>
          <Link href={`/?ticker=${card.ticker}`} className="mt-2 inline-block text-sm text-zinc-100 underline decoration-zinc-600 underline-offset-4">
            Analyze {card.ticker}
          </Link>
        </div>
      )}
    </article>
  );
}

export default function DashboardPage() {
  const [cards, setCards] = useState<WatchCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/watchlist", { cache: "no-store" });
      const body = (await response.json()) as { cards?: WatchCard[]; error?: string };
      if (!response.ok || !body.cards) throw new Error(body.error ?? "");
      setCards(body.cards);
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The watchlist could not be loaded. Please try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(ticker: string, action: "add" | "remove") {
    setBusy(true);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, action }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "");
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The watchlist could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    setInput("");
    void update(ticker, "add");
  }

  const alerts = cards?.filter((c) => c.newFilings.length > 0).length ?? 0;

  return (
    <div className="min-h-screen">
      <Header active="dashboard" />
      <main className="px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Watchlist</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {cards === null
                ? "Checking EDGAR for new filings..."
                : cards.length === 0
                  ? "Add the companies you cover. Each card checks EDGAR for filings newer than its last report."
                  : `${cards.length} companies, ${alerts} with new filings since their last report.`}
            </p>
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <label htmlFor="watch-input" className="sr-only">
              Ticker to watch
            </label>
            <input
              id="watch-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add ticker"
              disabled={busy}
              className="w-36 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm uppercase text-zinc-100 placeholder:normal-case placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <Button type="submit" disabled={busy || !input.trim()}>
              Watch
            </Button>
          </form>
        </div>
        {error ? (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(cards ?? []).map((card) => (
            <Card key={card.ticker} card={card} onRemove={(t) => void update(t, "remove")} />
          ))}
        </div>
      </main>
    </div>
  );
}
