"use client";

import { ArrowUpRight, CalendarClock, ChevronDown, FileText, RefreshCw, Sword, UserRound, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { FeedEvent, WatchCard, WatchStatus, WatchlistResponse } from "@/types";
import { Header } from "@/components/layout/header";
import { QuarterBars } from "@/components/map/quarter-bars";
import { compactMoney } from "@/lib/node-visuals";

const LAST_VISIT_KEY = "sw-watchlist-last-visit";

const STATUS: Record<WatchStatus, { word: string; bar: string; chip: string; tile: string }> = {
  act: { word: "Act now", bar: "bg-red-600", chip: "border-red-600 text-red-500", tile: "text-red-500" },
  review: { word: "Review", bar: "bg-amber-500", chip: "border-amber-600 text-amber-500", tile: "text-amber-500" },
  quiet: { word: "Quiet", bar: "bg-zinc-600", chip: "border-zinc-700 text-zinc-400", tile: "text-zinc-300" },
  unanalyzed: { word: "Not analyzed", bar: "bg-zinc-800", chip: "border-zinc-800 text-zinc-500", tile: "text-zinc-500" },
};

const STANCE: Record<string, string> = { STABLE: "Stable", CAUTION: "Caution", AT_RISK: "At risk", DISTRESSED: "Distressed" };

const SUGGESTED = ["WULF", "IREN", "CIFR"];

function readLastVisit(): string | null {
  try {
    return window.localStorage.getItem(LAST_VISIT_KEY);
  } catch {
    return null;
  }
}

function writeLastVisit(iso: string) {
  try {
    window.localStorage.setItem(LAST_VISIT_KEY, iso);
  } catch {
    // Private windows can block storage; the "new since" marker is a convenience.
  }
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function Cell({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">{label}</p>
      <div className="mt-1 font-mono text-[13px] font-semibold text-zinc-100">{children}</div>
      {note ? <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{note}</div> : null}
    </div>
  );
}

function QueueRow({ card, onRemove }: { card: WatchCard; onRemove: (ticker: string) => void }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[card.status];
  const due = card.watchItems.filter((w) => w.status === "due").length;
  const reread = card.newFilings.length > 0 || due > 0;

  if (card.status === "unanalyzed") {
    return (
      <article className="surface relative flex flex-wrap items-center gap-4 overflow-hidden rounded-xs border border-zinc-800 py-4 pl-6 pr-4">
        <span className={`absolute inset-y-0 left-0 w-[3px] ${s.bar}`} aria-hidden />
        <span className="font-mono text-[15px] font-bold text-zinc-200">{card.ticker}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">{card.name ?? "Not analyzed yet"}</span>
        <Link
          href={`/?ticker=${card.ticker}`}
          className="rounded-xs border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-zinc-500 hover:text-zinc-50"
        >
          Analyze {card.ticker}
        </Link>
        <button type="button" onClick={() => onRemove(card.ticker)} className="text-zinc-600 hover:text-zinc-200" aria-label={`Stop watching ${card.ticker}`}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </article>
    );
  }

  const cashNow = card.cash.at(-1)?.value ?? null;
  const runwayTone = card.runwayQuarters === null ? "text-zinc-100" : card.runwayQuarters < 4 ? "text-red-400" : card.runwayQuarters < 8 ? "text-amber-400" : "text-zinc-100";
  return (
    <article className="queue-row surface relative overflow-hidden rounded-xs border border-zinc-800">
      <span className={`absolute inset-y-0 left-0 w-[3px] ${s.bar}`} aria-hidden />
      <div className="py-4 pl-6 pr-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href={`/?report=${card.reportId}`} className="font-mono text-[15px] font-bold tracking-wide text-zinc-50 hover:underline">
            {card.ticker}
          </Link>
          <span className="min-w-0 truncate text-sm text-zinc-300">{card.name}</span>
          <span className={`rounded-xs border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${s.chip}`}>{s.word}</span>
          <span className="ml-auto font-mono text-[10px] text-zinc-500">
            {card.quarter ? `${card.quarter} · ` : ""}
            {card.basedOn}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
          <Cell label="Cash, 8 quarters" note={card.liquidity ? `With credit line: ${card.liquidity}` : null}>
            <div className="flex items-end gap-2">
              <div className="w-20">
                <QuarterBars points={card.cash} color="#2563eb" height={22} format={compactMoney} label="Quarter-end cash" />
              </div>
              <span>{cashNow !== null ? compactMoney(cashNow) : "n/a"}</span>
            </div>
          </Cell>
          <Cell label="Runway" note={card.lastFcf !== null ? `FCF last qtr ${compactMoney(card.lastFcf)}` : "FCF not tagged"}>
            <span className={runwayTone}>
              {card.runwayQuarters !== null ? `${card.runwayQuarters.toFixed(1)} qtrs` : card.lastFcf !== null && card.lastFcf >= 0 ? "Cash positive" : "n/a"}
            </span>
          </Cell>
          <Cell label="Next debt due" note={card.nextMaturity?.text}>
            {card.nextMaturity?.date ?? "None dated"}
          </Cell>
          <Cell label="Stock, 90 days" note={card.benchmarkReturn90d !== null ? `S&P 500 ${pct(card.benchmarkReturn90d)}` : null}>
            <span className={card.return90d !== null && card.return90d < 0 ? "text-red-400" : "text-emerald-400"}>{card.return90d !== null ? pct(card.return90d) : "n/a"}</span>
          </Cell>
          <Cell label="Memo vs the case" note={`${card.moderatePoints} moderate point${card.moderatePoints === 1 ? "" : "s"}`}>
            <span className="inline-flex items-center gap-1.5">
              {card.memoStance ? STANCE[card.memoStance] : "n/a"}
              <span className="text-zinc-600">·</span>
              <Sword className="h-3 w-3 text-red-500" aria-hidden />
              <span className={card.strongPoints ? "text-red-400" : "text-zinc-400"}>{card.strongPoints} strong</span>
            </span>
          </Cell>
        </div>

        {card.reasons.length ? (
          <ul className="mt-4 space-y-1.5 border-t border-zinc-800 pt-3">
            {card.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug">
                <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-[1px] ${r.tone === "act" ? "bg-red-600" : "bg-amber-500"}`} aria-hidden />
                <span className="min-w-0 flex-1 text-zinc-200">
                  {r.text}
                  {r.date ? <span className="ml-2 font-mono text-[10px] text-zinc-500">{r.date}</span> : null}
                </span>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-zinc-500 hover:text-zinc-100" aria-label="Open the source">
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-t border-zinc-800 pt-3 text-[13px] text-zinc-500">Nothing new: no filing since the report, and no rule applies.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={`/?report=${card.reportId}`} className="text-xs font-medium text-zinc-200 hover:text-zinc-50">
            Open report &rarr;
          </Link>
          {reread ? (
            <Link
              href={`/?ticker=${card.ticker}&fresh=1`}
              className="inline-flex items-center gap-1.5 rounded-xs border border-amber-600 px-2 py-0.5 text-xs font-medium text-amber-500 hover:bg-amber-600 hover:text-zinc-950"
            >
              <RefreshCw className="h-3 w-3" aria-hidden /> Re-read filings and argue again
            </Link>
          ) : null}
          {card.watchItems.length ? (
            <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100" aria-expanded={open}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden />
              Watch items: {card.watchItems.length - due} pending
              {due ? <span className="text-amber-500">, {due} ready to check</span> : null}
            </button>
          ) : null}
          <button type="button" onClick={() => onRemove(card.ticker)} className="ml-auto text-xs text-zinc-600 hover:text-zinc-200">
            Stop watching
          </button>
        </div>

        {open ? (
          <ol className="mt-3 space-y-2 border-l-2 border-red-600/60 pl-4">
            {card.watchItems.map((w, i) => (
              <li key={i} className="text-[13px] leading-snug">
                <span className={`mr-2 rounded-xs border px-1.5 py-px font-mono text-[9px] uppercase tracking-wider ${w.status === "due" ? "border-amber-600 text-amber-500" : "border-zinc-700 text-zinc-500"}`}>
                  {w.status === "due" ? "Ready to check" : "Pending"}
                </span>
                <span className="text-zinc-100">{w.item}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">When: {w.when}</span>
                <span className="mt-0.5 block text-xs text-zinc-400">{w.signal}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </article>
  );
}

const FEED_ICON: Record<FeedEvent["kind"], typeof FileText> = { filing: FileText, "8-K": FileText, insider: UserRound, maturity: CalendarClock };

function FeedRow({ event, fresh }: { event: FeedEvent; fresh: boolean }) {
  const Icon = FEED_ICON[event.kind];
  const body = (
    <>
      <span className="font-mono text-[10px] text-zinc-500">{event.date}</span>
      <span className="flex items-start gap-2">
        <span className="mt-px w-11 shrink-0 font-mono text-[11px] font-semibold text-zinc-200">{event.ticker}</span>
        <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${event.tone === "act" ? "text-red-500" : event.tone === "review" ? "text-amber-500" : "text-zinc-500"}`} aria-hidden />
        <span className="min-w-0 flex-1 text-[12px] leading-snug text-zinc-300">{event.text}</span>
        {fresh ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-label="New since your last visit" /> : null}
      </span>
    </>
  );
  return (
    <li className="border-b border-zinc-800/70 py-2 last:border-0">
      {event.url ? (
        <a href={event.url} target="_blank" rel="noopener noreferrer" className="block hover:bg-zinc-900">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

function Feed({ feed, lastVisit }: { feed: FeedEvent[]; lastVisit: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = feed.filter((e) => e.date > today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  const recent = feed.filter((e) => e.date <= today).slice(0, 40);
  const since = lastVisit?.slice(0, 10) ?? null;
  const freshCount = since ? recent.filter((e) => e.date > since).length : 0;
  return (
    <aside className="surface rounded-xs border border-zinc-800 p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> Activity across the watchlist
      </h2>
      <p className="mt-1 text-[11px] text-zinc-500">
        {since ? (freshCount ? `${freshCount} new since your last visit on ${since}` : `Nothing new since your last visit on ${since}`) : "Filings, 8-Ks, insider trades and debt due dates"}
      </p>
      {upcoming.length ? (
        <>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-red-500">Coming up</p>
          <ul className="mt-1">
            {upcoming.map((e, i) => (
              <FeedRow key={`u-${i}`} event={e} fresh={false} />
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recent</p>
      {recent.length ? (
        <ul className="mt-1">
          {recent.map((e, i) => (
            <FeedRow key={`r-${i}`} event={e} fresh={Boolean(since && e.date > since)} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">No filings or insider trades in the last 120 days.</p>
      )}
    </aside>
  );
}

function Tile({ status, count, active, onClick }: { status: WatchStatus; count: number; active: boolean; onClick: () => void }) {
  const s = STATUS[status];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`surface relative overflow-hidden rounded-xs border p-4 text-left transition-colors duration-150 ${active ? "border-zinc-500" : "border-zinc-800 hover:border-zinc-700"}`}
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${s.bar}`} aria-hidden />
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{s.word}</p>
      <p className={`mt-1 font-display text-4xl font-semibold tabular-nums ${count ? s.tile : "text-zinc-700"}`}>{count}</p>
    </button>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<WatchlistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<WatchStatus | null>(null);
  const [lastVisit, setLastVisit] = useState<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/watchlist${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const body = (await response.json()) as WatchlistResponse & { error?: string };
      if (!response.ok || !body.cards) throw new Error(body.error ?? "");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The watchlist could not be loaded. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Remember the previous visit for the "new since" marker, then record this one.
    setLastVisit(readLastVisit());
    writeLastVisit(new Date().toISOString());
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

  const cards = useMemo(() => data?.cards ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<WatchStatus, number> = { act: 0, review: 0, quiet: 0, unanalyzed: 0 };
    for (const card of cards) c[card.status]++;
    return c;
  }, [cards]);
  const shown = filter ? cards.filter((c) => c.status === filter) : cards;
  const checked = data ? new Date(data.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="min-h-screen">
      <Header active="dashboard" />
      <main className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-zinc-800 pb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Watchlist &middot; the morning queue</p>
            <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-[-0.01em] text-zinc-50">Which of your companies needs you today, and why</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
              Each company is checked against EDGAR and its XBRL figures, then placed in Act now, Review or Quiet by written rules. Every reason links to its
              source, and the &ldquo;What to watch&rdquo; items from each Devil&rsquo;s Advocate case are tracked until the filing that settles them arrives.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <form onSubmit={submit} className="flex gap-2">
              <label htmlFor="watch-input" className="sr-only">
                Ticker to watch
              </label>
              <input
                id="watch-input"
                value={input}
                onChange={(e) => setInput(e.target.value.replace(/[^A-Za-z0-9.\-]/g, ""))}
                placeholder="Add a ticker"
                disabled={busy}
                maxLength={10}
                className="h-9 w-40 rounded-xs border border-zinc-800 bg-zinc-900 px-3 font-mono text-[13px] uppercase text-zinc-50 placeholder:font-sans placeholder:normal-case placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="h-9 rounded-xs bg-zinc-50 px-4 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                Watch
              </button>
            </form>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 hover:text-zinc-200 disabled:opacity-60"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              {busy ? "Checking EDGAR..." : checked ? `Checked at ${checked} · check again` : "Check now"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {data === null && !error ? (
          <div className="mt-8 space-y-3" aria-busy>
            <p className="font-mono text-xs text-zinc-500">Checking EDGAR and XBRL for each watched company...</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 rounded-xs border border-zinc-800 bg-zinc-900/50" />
            ))}
          </div>
        ) : null}

        {data && cards.length === 0 ? (
          <div className="mx-auto mt-16 max-w-xl rounded-xs border border-dashed border-zinc-700 p-8 text-center">
            <p className="font-display text-lg font-semibold text-zinc-100">Start your queue</p>
            <p className="mt-2 text-sm text-zinc-400">
              Add the companies you cover. Each morning the queue shows which filed something, which are running short of cash, which have debt coming due, and
              which the Devil&rsquo;s Advocate disagrees with.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              {SUGGESTED.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => void update(t, "add")}
                  className="rounded-xs border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-500 hover:text-zinc-50"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {cards.length ? (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["act", "review", "quiet", "unanalyzed"] as WatchStatus[]).map((st) => (
                <Tile key={st} status={st} count={counts[st]} active={filter === st} onClick={() => setFilter((f) => (f === st ? null : st))} />
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section aria-label="Queue" className="min-w-0 space-y-3">
                {filter ? (
                  <button type="button" onClick={() => setFilter(null)} className="font-mono text-[11px] text-zinc-500 hover:text-zinc-200">
                    Showing {STATUS[filter].word} only &middot; show all
                  </button>
                ) : null}
                {shown.map((card) => (
                  <QueueRow key={card.ticker} card={card} onRemove={(t) => void update(t, "remove")} />
                ))}
                <details className="pt-4 text-xs text-zinc-500">
                  <summary className="cursor-pointer hover:text-zinc-200">How the order is decided</summary>
                  <div className="mt-3 grid gap-6 md:grid-cols-2">
                    <div>
                      <p className="mb-1.5 font-semibold uppercase tracking-wider text-red-500">Act now</p>
                      <ul className="list-disc space-y-1 pl-4 leading-relaxed">
                        <li>An 8-K since the report: bankruptcy (1.03), debt accelerated (2.04), delisting notice (3.01) or earlier statements no longer reliable (4.02)</li>
                        <li>Cash covers fewer than four quarters of the latest quarter&rsquo;s cash burn</li>
                        <li>Debt due within twelve months exceeds cash</li>
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1.5 font-semibold uppercase tracking-wider text-amber-500">Review</p>
                      <ul className="list-disc space-y-1 pl-4 leading-relaxed">
                        <li>A new 10-Q or 10-K since the report</li>
                        <li>An 8-K about new debt, an auditor change, an officer leaving, a material agreement, an impairment or a change in control</li>
                        <li>Cash covers four to eight quarters of the latest burn; debt due within two years</li>
                        <li>The memo reads Stable or Caution while the Devil&rsquo;s Advocate makes three or more strong points</li>
                        <li>The stock is down 20% or more over 90 days and 15 points behind the S&amp;P 500; cash fell more than 25% in a quarter</li>
                        <li>A &ldquo;What to watch&rdquo; item can now be checked</li>
                      </ul>
                    </div>
                  </div>
                  <p className="mt-3">Quiet means none of these apply. There is no score; each reason shown is the rule that put the company there.</p>
                </details>
              </section>
              <Feed feed={data?.feed ?? []} lastVisit={lastVisit} />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
