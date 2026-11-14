"use client";

import { ExternalLink, Radar, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CommitteeRecord, CommitteeTurn, NewsEvent } from "@/types";

const DIRECTION: Record<string, { label: string; tone: string }> = {
  negative: { label: "Bad for lenders", tone: "border-red-700/60 text-red-500" },
  positive: { label: "Good for lenders", tone: "border-emerald-700/60 text-emerald-500" },
  neutral: { label: "Neutral", tone: "border-zinc-700 text-zinc-400" },
};

const TYPE: Record<string, string> = {
  default_or_missed_payment: "Default",
  bankruptcy_or_restructuring: "Restructuring",
  refinancing_or_new_debt: "Debt",
  liquidity_or_funding: "Liquidity",
  earnings_or_guidance: "Earnings",
  rating_change: "Rating",
  legal_or_regulatory: "Legal",
  management_or_owner_change: "Management",
  asset_sale_or_deal: "Deal",
  contract_or_customer: "Customer",
  other: "Other",
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

function Chip({ children, tone = "text-zinc-400 border-zinc-800" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`rounded-xs border px-1.5 py-0.5 font-mono text-[11px] ${tone}`}>{children}</span>;
}

function Row({ e, turnId, onJump }: { e: NewsEvent; turnId: string | null; onJump: (id: string) => void }) {
  const d = e.direction ? DIRECTION[e.direction] : null;
  const r = e.reaction;
  return (
    <li className="border-b border-zinc-800/70 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        {d ? <span className={`shrink-0 rounded-xs border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${d.tone}`}>{d.label}</span> : null}
        <a href={e.url} target="_blank" rel="noopener noreferrer" className={`min-w-0 flex-1 text-[13px] leading-snug hover:underline ${e.passed ? "text-zinc-100" : "text-zinc-400"}`}>
          {e.headline} <ExternalLink className="inline h-3 w-3 text-zinc-600" aria-hidden />
        </a>
        {turnId ? (
          <button type="button" onClick={() => onJump(turnId)} className="shrink-0 rounded-xs border border-amber-600/70 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400 hover:text-amber-300">
            In the debate · {turnId}
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
        <span>
          {e.publisher || "News"} · {e.date}
        </span>
        {e.eventType ? <Chip>{TYPE[e.eventType]}</Chip> : null}
        {e.relevance !== null ? <Chip tone={e.relevance >= 0.7 ? "text-zinc-200 border-zinc-700" : "text-zinc-500 border-zinc-800"}>relevance {e.relevance.toFixed(2)}</Chip> : null}
        <Chip tone={e.novelty >= 0.6 ? "text-zinc-200 border-zinc-700" : "text-zinc-500 border-zinc-800"}>novelty {e.novelty.toFixed(2)}</Chip>
        {r ? (
          <Chip tone={r.jump ? (r.ret < 0 ? "text-red-400 border-red-800" : "text-emerald-400 border-emerald-800") : "text-zinc-400 border-zinc-800"}>
            stock {r.ret >= 0 ? "+" : ""}
            {(r.ret * 100).toFixed(1)}% on {r.session.slice(5)}
            {r.partial ? " so far" : ""} · z {r.z.toFixed(1)}
            {r.jump ? " · jump" : ""}
          </Chip>
        ) : null}
      </div>
      {!e.passed ? <p className="mt-1 text-xs text-zinc-500">{e.reason}</p> : null}
    </li>
  );
}

/**
 * The news radar: every headline from the last two weeks, what the filters
 * made of it, the market's reaction, and the ones put to the committee.
 * Scans run hourly on the server; "Scan now" runs one at most every ten minutes.
 */
export function NewsRadar({
  ticker,
  turns,
  onTabled,
  onJump,
}: {
  ticker: string;
  turns: CommitteeTurn[];
  onTabled: (record: CommitteeRecord, added: CommitteeTurn[]) => void;
  onJump: (id: string) => void;
}) {
  const [events, setEvents] = useState<NewsEvent[] | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    setNote(null);
    try {
      const r = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker }) });
      const body = (await r.json()) as { scan?: { events: NewsEvent[]; scannedAt: string; fresh: number }; tabled?: { record: CommitteeRecord; added: CommitteeTurn[] } | null; reused?: boolean; error?: string };
      if (!r.ok || !body.scan) throw new Error(body.error ?? "");
      setEvents(body.scan.events);
      setScannedAt(body.scan.scannedAt);
      if (body.tabled) onTabled(body.tabled.record, body.tabled.added);
      setNote(body.reused ? "Scanned in the last ten minutes; showing that scan." : body.tabled ? "A new headline went to the committee." : body.scan.fresh ? `${body.scan.fresh} new headline${body.scan.fresh === 1 ? "" : "s"}; none needs the committee.` : "No new headlines.");
    } catch (err) {
      setNote(err instanceof Error && err.message ? err.message : "The news could not be read.");
    } finally {
      setScanning(false);
    }
  }, [ticker, onTabled]);

  useEffect(() => {
    let live = true;
    fetch(`/api/radar?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json() as Promise<{ events?: NewsEvent[]; scannedAt?: string | null }>)
      .then((body) => {
        if (!live) return;
        setEvents(body.events ?? []);
        setScannedAt(body.scannedAt ?? null);
      })
      .catch(() => live && setEvents([]));
    return () => {
      live = false;
    };
  }, [ticker]);

  // A headline counts as in the debate only while the current committee has its line.
  const turnFor = (e: NewsEvent) => turns.find((t) => t.move === "news" && t.evidence?.source.url === e.url)?.id ?? null;
  const list = events ?? [];
  const novel = list.filter((e) => e.novelty >= 0.6);
  const relevant = novel.filter((e) => (e.relevance ?? 0) >= 0.7);
  const passed = list.filter((e) => e.passed);
  const inDebate = list.filter((e) => turnFor(e));
  const filtered = list.filter((e) => !e.passed);
  const steps: [number, string][] = [
    [list.length, "headlines, 14 days"],
    [novel.length, "new stories"],
    [relevant.length, "relevant to lenders"],
    [passed.length, "with a direction"],
    [inDebate.length, "in the debate"],
  ];

  return (
    <section className="surface mt-6 rounded-xs border border-zinc-800 p-4" aria-label="News radar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          <Radar className="h-3.5 w-3.5 text-amber-400" aria-hidden /> News radar
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Scans hourly · last {ago(scannedAt)}</span>
          <button
            type="button"
            onClick={() => void scan()}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 rounded-xs border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} aria-hidden /> {scanning ? "Scanning" : "Scan now"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Repeats are dropped in code by word overlap with the past week&apos;s headlines. The model labels only new stories. Those with relevance 0.70 or more and a direction go to the committee, the strongest one per scan,
        where the Chair tables it and the other side must answer. The stock&apos;s move is the check on the model&apos;s label: z is the day&apos;s return over its usual daily move, and 3 or more is a jump.
      </p>

      <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label="Filter funnel">
        {steps.map(([n, label], i) => (
          <li key={label} className="flex items-center gap-1.5">
            {i ? <span className="text-zinc-700">→</span> : null}
            <span className="font-mono font-semibold text-zinc-100">{n}</span>
            <span className="text-zinc-500">{label}</span>
          </li>
        ))}
      </ol>
      {note ? (
        <p className="mt-2 text-xs text-amber-400" role="status">
          {note}
        </p>
      ) : null}

      {events === null ? (
        <p className="mt-3 text-xs text-zinc-500">Loading…</p>
      ) : !list.length ? (
        <p className="mt-3 text-xs text-zinc-500">No headlines scanned yet. Scan now to read the last two weeks.</p>
      ) : (
        <>
          {passed.length ? (
            <ul className="mt-2">
              {passed.map((e) => (
                <Row key={e.url} e={e} turnId={turnFor(e)} onJump={onJump} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">Nothing in the last two weeks passed both filters.</p>
          )}
          {filtered.length ? (
            <div className="mt-2">
              <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100" aria-expanded={showAll}>
                {showAll ? "Hide" : "Show"} {filtered.length} filtered out, with the reason
              </button>
              {showAll ? (
                <ul className="mt-1">
                  {filtered.map((e) => (
                    <Row key={e.url} e={e} turnId={null} onJump={onJump} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      <p className="mt-3 border-t border-zinc-800 pt-2 text-xs leading-relaxed text-zinc-500">
        News does not move the bankruptcy probability. That would need a weight fitted on past headlines and the defaults that followed, and that history is not in the data, so any weight would be made up.
      </p>
    </section>
  );
}
