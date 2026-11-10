"use client";

import { Gavel, RotateCcw, Send } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ChairSummary, CommitteeEvent, CommitteeRecord, CommitteeTurn, DistressScore, FilingChange, RateStress, Report, Scoreboard } from "@/types";
import { BAND_STYLE, DistressCard, pctText } from "@/components/distress/distress-card";
import { RateStressPanel } from "@/components/events/rate-stress-panel";
import { TurnLine } from "./turn-line";
import { ArgumentFlow } from "./argument-flow";
import { LmeScanner } from "./lme-scanner";

const MAX_QUESTIONS = 3;
/** Pause between replayed lines, and before a checked line shows its verdict, so a reader can follow. */
const REPLAY_MS = 1400;
const VERDICT_MS = 700;

interface Forecast {
  distress: DistressScore | null;
  filingChange: FilingChange | null;
  rateStress: RateStress | null;
}

function Tile({ label, value, tone = "text-zinc-50", sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="min-w-0 border-r border-zinc-800 px-4 py-2.5 last:border-r-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-lg font-semibold ${tone}`}>{value}</p>
      {sub ? <p className="truncate text-[10px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function ScoreRail({ score }: { score: Scoreboard | null }) {
  const s = score ?? { raised: 0, rebutted: 0, conceded: 0, unansweredStrong: 0, verified: 0, unsupported: 0 };
  const row = (label: string, value: number, tone = "text-zinc-100") => (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`font-mono text-sm font-semibold ${tone}`}>{value}</span>
    </div>
  );
  return (
    <section className="surface rounded-xs border border-zinc-800 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Scoreboard</p>
      <p className="mt-1 text-[11px] text-zinc-500">Kept by code from the moves. The agents never score themselves.</p>
      <div className="mt-2 divide-y divide-zinc-800/70">
        {row("Points raised against the credit", s.raised)}
        {row("Rebutted with evidence", s.rebutted, "text-emerald-500")}
        {row("Conceded", s.conceded, "text-amber-500")}
        {row("Strong points unanswered", s.unansweredStrong, s.unansweredStrong ? "text-red-500" : "text-zinc-100")}
        {row("Lines verified", s.verified)}
        {row("Lines struck by the verifier", s.unsupported, s.unsupported ? "text-red-500" : "text-zinc-100")}
      </div>
    </section>
  );
}

function ChairBox({ summary }: { summary: ChairSummary }) {
  const list = (title: string, items: string[], tone: string) =>
    items.length ? (
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{title}</p>
        <ul className="mt-1 space-y-1.5 text-[13px] leading-relaxed text-zinc-300">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <section className="surface mt-6 rounded-xs border border-zinc-700 p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
        <Gavel className="h-3.5 w-3.5" aria-hidden /> The Chair&rsquo;s summary
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">Summarises the verified lines only. The Chair never votes, rates or recommends.</p>
      <div className="mt-3 grid gap-5 md:grid-cols-3">
        {list("Agreed", summary.agreed, "text-emerald-500")}
        {list("Disputed", summary.disputed, "text-red-500")}
        {summary.watch.length ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">What would settle it</p>
            <ul className="mt-1 space-y-1.5 text-[13px] leading-relaxed text-zinc-300">
              {summary.watch.map((w) => (
                <li key={w.item}>
                  {w.item} <span className="text-zinc-500">({w.when})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Reads an NDJSON stream of committee events. */
async function readStream(response: Response, onEvent: (e: CommitteeEvent) => void): Promise<void> {
  if (!response.body) throw new Error("No stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as CommitteeEvent);
  }
}

/**
 * The investment committee: the Analyst defends the credit, the Devil's
 * Advocate attacks it, the Chair summarises. Every line streams in as
 * "checking" and flips to verified or struck when the code verifier is done.
 */
export function CommitteeRoom({ report }: { report: Report }) {
  const [forecast, setForecast] = useState<Forecast>({
    distress: report.distress ?? null,
    filingChange: report.filingChange ?? null,
    rateStress: report.rateStress ?? null,
  });
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [turns, setTurns] = useState<CommitteeTurn[]>([]);
  const [score, setScore] = useState<Scoreboard | null>(null);
  const [chairSummary, setChair] = useState<ChairSummary | null>(null);
  const [trace, setTrace] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<CommitteeRecord | null>(report.committee ?? null);
  const [replaying, setReplaying] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [view, setView] = useState<"transcript" | "map">("transcript");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const company = report.graph.company;

  // The forecast layer: scored on the server the first time a report opens, and the rate path refreshed daily.
  useEffect(() => {
    let live = true;
    fetch("/api/forecast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: report.id }) })
      .then(async (r) => {
        const body = (await r.json()) as Forecast & { error?: string };
        if (!live) return;
        if (r.ok) setForecast(body);
        else setForecastError(body.error ?? "The forecast could not be computed.");
      })
      .catch(() => live && setForecastError("The forecast could not be computed."));
    return () => {
      live = false;
    };
  }, [report.id]);

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  /** Shows a saved committee line by line, each flipping from checking to its saved verdict. */
  const replay = useCallback((saved: CommitteeRecord) => {
    clearTimers();
    setTurns([]);
    setScore(null);
    setChair(null);
    setReplaying(true);
    saved.turns.forEach((t, i) => {
      timers.current.push(
        setTimeout(() => setTurns((list) => [...list, { ...t, status: t.speaker === "user" ? t.status : "pending" }]), i * REPLAY_MS),
        setTimeout(() => setTurns((list) => list.map((x) => (x.id === t.id ? t : x))), i * REPLAY_MS + VERDICT_MS),
      );
    });
    timers.current.push(
      setTimeout(() => {
        setScore(saved.score);
        setChair(saved.chair);
        setReplaying(false);
      }, saved.turns.length * REPLAY_MS),
    );
  }, []);

  const showNow = useCallback((saved: CommitteeRecord) => {
    clearTimers();
    setReplaying(false);
    setTurns(saved.turns);
    setScore(saved.score);
    setChair(saved.chair);
  }, []);

  const run = useCallback(
    async (fresh: boolean) => {
      clearTimers();
      setRunning(true);
      setError(null);
      setTurns([]);
      setScore(null);
      setChair(null);
      setTrace("Convening the committee");
      try {
        const response = await fetch("/api/committee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: report.id, fresh }),
        });
        let replayed = false;
        await readStream(response, (e) => {
          if (e.type === "trace") setTrace(e.text);
          if (e.type === "turn") setTurns((list) => [...list, e.turn]);
          if (e.type === "verify") {
            const t = setTimeout(() => setTurns((list) => list.map((x) => (x.id === e.id ? { ...x, status: e.status, problems: e.problems } : x))), VERDICT_MS);
            timers.current.push(t);
          }
          if (e.type === "score") setScore(e.score);
          if (e.type === "chair") setChair(e.summary);
          if (e.type === "error") setError(e.message);
          if (e.type === "done") {
            setRecord(e.record);
            // A saved committee comes back whole: replay it rather than dumping it.
            if (!fresh && e.record.turns.length && !replayed) {
              replayed = true;
              replay(e.record);
            }
          }
        });
      } catch {
        setError("The committee stopped before it finished. Please try again.");
      } finally {
        setRunning(false);
        setTrace(null);
      }
    },
    [report.id, replay],
  );

  // A saved committee replays on arrival; a report without one convenes it.
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (started.current === report.id) return;
    started.current = report.id;
    if (report.committee) replay(report.committee);
    else void run(false);
  }, [report.id, report.committee, replay, run]);

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const q = question.trim();
    if (q.length < 5 || asking) return;
    setAsking(true);
    setError(null);
    try {
      const response = await fetch("/api/committee/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, question: q }),
      });
      const body = (await response.json()) as { record?: CommitteeRecord; added?: CommitteeTurn[]; error?: string };
      if (!response.ok || !body.record || !body.added) throw new Error(body.error ?? "");
      const added = body.added;
      setRecord(body.record);
      setQuestion("");
      setTurns((list) => [...list, ...added.map((t) => (t.speaker === "user" ? t : { ...t, status: "pending" as const }))]);
      const t = setTimeout(() => setTurns((list) => list.map((x) => added.find((a) => a.id === x.id) ?? x)), VERDICT_MS);
      timers.current.push(t);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The question could not be answered.");
    } finally {
      setAsking(false);
    }
  };

  const jump = (id: string) => document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  const openInTranscript = useCallback((id: string) => {
    setView("transcript");
    setTimeout(() => document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, []);
  const metric = (key: string) => report.capital?.metrics.find((m) => m.key === key)?.display ?? "n/a";
  const d = forecast.distress;
  const hold = forecast.rateStress?.scenarios.find((s) => s.key === "hold");
  const asked = record?.questionsAsked ?? 0;
  const busy = running || replaying;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:px-8">
      <div className="surface grid grid-cols-2 overflow-hidden rounded-xs border border-zinc-800 sm:grid-cols-3 lg:grid-cols-6" data-tour="tiles">
        <Tile
          label="Bankruptcy in 12 months"
          value={d ? pctText(d.probability) : forecastError ? "n/a" : "…"}
          tone={d ? BAND_STYLE[d.band].text : "text-zinc-500"}
          sub={d ? `${BAND_STYLE[d.band].label} · average ${pctText(d.baseRate)}` : (forecastError ?? "Scoring")}
        />
        <Tile label="Altman Z''" value={d?.zScore !== null && d?.zScore !== undefined ? d.zScore.toFixed(2) : "n/a"} sub={d?.zZone ? `${d.zZone} zone` : undefined} />
        <Tile label="Debt / EBITDA" value={metric("debt_to_ebitda")} />
        <Tile label="EBITDA / interest" value={metric("interest_coverage")} />
        <Tile label="Liquidity" value={metric("liquidity").replace(/^Up to /, "")} />
        <Tile label="Cash runs out" value={hold ? (hold.runsOutAt ?? "Not in 2 yrs") : "n/a"} tone={hold?.runsOutAt ? "text-red-500" : "text-zinc-50"} sub="Base case, no new money" />
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Ground rules: code does the math · the AI never decides or recommends a trade · every line cites one piece of evidence and is checked before it counts.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-zinc-50">Investment committee: {company.ticker}</h2>
            <div className="flex items-center gap-2">
              {record && !busy ? (
                <button type="button" onClick={() => replay(record)} className="inline-flex items-center gap-1.5 rounded-xs border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50">
                  <RotateCcw className="h-3 w-3" aria-hidden /> Replay
                </button>
              ) : null}
              {replaying && record ? (
                <button type="button" onClick={() => showNow(record)} className="rounded-xs border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500">
                  Show all
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(true)}
                className="rounded-xs border border-red-600 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-600 hover:text-white disabled:opacity-40"
              >
                {record ? "Convene again" : "Convene"}
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-4 text-[11px] text-zinc-500">
            <span className="text-emerald-500">Analyst: defends the credit</span>
            <span className="text-red-500">Devil&rsquo;s Advocate: attacks it</span>
            {record && !running ? (
              <span>
                {record.calls} model calls · {(record.elapsedMs / 1000).toFixed(0)}s · run {record.generatedAt.slice(0, 10)}
              </span>
            ) : null}
          </div>
          {trace ? (
            <p className="mt-3 font-mono text-[11px] text-zinc-400" role="status" aria-live="polite">
              <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" aria-hidden />
              {trace}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-4 inline-flex rounded-xs border border-zinc-700 p-0.5 text-xs" role="tablist" aria-label="Committee view" data-tour="argument-map">
            {(["transcript", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-[2px] px-3 py-1 ${view === v ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-100"}`}
              >
                {v === "transcript" ? "Transcript" : "Argument map"}
              </button>
            ))}
          </div>
          {view === "map" ? (
            <div className="mt-3">
              <ArgumentFlow turns={turns} distress={d} onOpen={openInTranscript} />
            </div>
          ) : (
            <ol className="mt-4 space-y-3" data-tour="debate">
              {turns.map((t) => (
                <TurnLine key={t.id} turn={t} onJump={jump} />
              ))}
            </ol>
          )}
          {!turns.length && !running && !error ? <p className="mt-6 text-sm text-zinc-500">The committee has not met on this report yet.</p> : null}
          {chairSummary ? <ChairBox summary={chairSummary} /> : null}

          {record && !busy ? (
            <form onSubmit={(e) => void ask(e)} className="mt-6 flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={asked >= MAX_QUESTIONS || asking}
                placeholder={asked >= MAX_QUESTIONS ? "Three questions asked: convene again for more" : `Ask the committee (${MAX_QUESTIONS - asked} left), e.g. "Does the revolver cover the 2027 maturity?"`}
                className="min-w-0 flex-1 rounded-xs border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                maxLength={400}
              />
              <button type="submit" disabled={asked >= MAX_QUESTIONS || asking || question.trim().length < 5} className="inline-flex items-center gap-1.5 rounded-xs border border-zinc-600 px-3 text-xs text-zinc-200 hover:border-zinc-400 disabled:opacity-40">
                <Send className="h-3.5 w-3.5" aria-hidden /> {asking ? "Asking" : "Ask"}
              </button>
            </form>
          ) : null}

          <LmeScanner report={report} />
        </div>

        <aside className="space-y-4">
          <ScoreRail score={score} />
          {d ? <DistressCard distress={d} /> : null}
          {forecast.rateStress ? (
            <div data-tour="rates">
              <RateStressPanel stress={forecast.rateStress} />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
