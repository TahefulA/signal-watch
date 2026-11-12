"use client";

import { ExternalLink, Pause, Play, Radio } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MicrostructureDetector, type Alert, type AlertKind, type Sample } from "@/lib/stream/detector";
import { POLYMARKET_WS, parseMessage, recentTrades, type BookEvent, type MarketInfo } from "@/lib/stream/polymarket";
import { RuleRunner } from "@/lib/alerts/engine";
import { type LiveQuestion, LiveQuestions } from "./live-questions";

type Mode = "live" | "replay";

interface Recording {
  file: string;
  question: string;
  startedAt: string;
  endedAt: string;
  events: number;
  trades: number;
}
interface RecordingFile {
  market: MarketInfo;
  startedAt: string;
  endedAt: string;
  seed?: BookEvent[];
  events: BookEvent[];
}

const SERIES_MAX = 900;
const SPEEDS = [10, 60, 240];
const KIND: Record<AlertKind, { label: string; tone: string }> = {
  large_trade: { label: "Large fill", tone: "border-amber-600 text-amber-400" },
  sustained_move: { label: "Sustained move", tone: "border-sky-600 text-sky-400" },
  depth_shift: { label: "Depth shift", tone: "border-zinc-500 text-zinc-300" },
  combined: { label: "Unusual activity", tone: "border-red-600 text-red-400" },
  rule: { label: "Your question", tone: "border-emerald-600 text-emerald-400" },
};
const QUESTIONS_KEY = "sw-live-questions";

const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour12: false });
const cents = (p: number | null | undefined) => (p === null || p === undefined || Number.isNaN(p) ? "n/a" : `${(p * 100).toFixed(1)}¢`);
const shares = (v: number) => (Number.isNaN(v) ? "n/a" : v >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : v.toFixed(0));

interface EngineState {
  detector: MicrostructureDetector;
  series: Sample[];
  alerts: Alert[];
  events: number;
  now: number;
  /** One runner per live question, keyed by its id. */
  rules: Map<string, RuleRunner>;
}

function newEngine(questions: LiveQuestion[] = []): EngineState {
  return { detector: new MicrostructureDetector(), series: [], alerts: [], events: 0, now: 0, rules: new Map(questions.map((q) => [q.id, new RuleRunner(q.rule)])) };
}

function loadQuestions(): LiveQuestion[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(QUESTIONS_KEY) ?? "[]") as LiveQuestion[];
    return Array.isArray(raw) ? raw.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function MicrostructureView() {
  const [mode, setMode] = useState<Mode>("replay");
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingFile, setRecordingFile] = useState<string | null>(null);
  const [speed, setSpeed] = useState(60);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("Starting...");
  const [, setTick] = useState(0);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const questionsRef = useRef<LiveQuestion[]>([]);
  questionsRef.current = questions;
  const engine = useRef<EngineState>(newEngine());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const record = useCallback((alerts: Alert[]) => {
    if (alerts.length) engine.current.alerts = [...alerts.reverse(), ...engine.current.alerts].slice(0, 100);
  }, []);
  const pushSample = useCallback(
    (t: number) => {
      const e = engine.current;
      const { sample, alerts } = e.detector.sample(t);
      e.series.push(sample);
      if (e.series.length > SERIES_MAX) e.series.splice(0, e.series.length - SERIES_MAX);
      e.now = t;
      for (const [id, runner] of e.rules) {
        const fire = runner.onSample(sample);
        const name = questionsRef.current.find((q) => q.id === id)?.rule.name ?? runner.rule.name;
        if (fire) alerts.push({ t, kind: "rule", text: `${name}: ${fire.text}` });
      }
      record(alerts);
    },
    [record],
  );
  /** One feed event through the detectors and every live question. */
  const feed = useCallback(
    (ev: BookEvent) => {
      const e = engine.current;
      e.events++;
      for (const runner of e.rules.values()) runner.onEvent(ev);
      record(e.detector.onEvent(ev));
    },
    [record],
  );

  useEffect(() => {
    // Saved questions may load after the stream has started: give them runners on the running engine.
    const list = loadQuestions();
    for (const q of list) if (!engine.current.rules.has(q.id)) engine.current.rules.set(q.id, new RuleRunner(q.rule));
    setQuestions(list);
  }, []);
  const saveQuestions = (list: LiveQuestion[]) => {
    setQuestions(list);
    try {
      window.localStorage.setItem(QUESTIONS_KEY, JSON.stringify(list));
    } catch {
      // Questions still run for this visit.
    }
  };
  const addQuestion = (q: LiveQuestion) => {
    engine.current.rules.set(q.id, new RuleRunner(q.rule));
    saveQuestions([...questions, q].slice(-8));
  };
  const removeQuestion = (id: string) => {
    engine.current.rules.delete(id);
    saveQuestions(questions.filter((q) => q.id !== id));
  };

  useEffect(() => {
    fetch("/api/microstructure/markets")
      .then((r) => r.json())
      .then((m: MarketInfo[] | { error: string }) => {
        if (Array.isArray(m)) {
          setMarkets(m);
          setMarketId((id) => id ?? m[0]?.id ?? null);
        }
      })
      .catch(() => setStatus("Could not list Polymarket markets"));
    fetch("/replays/index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Recording[]) => {
        setRecordings(list);
        setRecordingFile((f) => f ?? list[0]?.file ?? null);
        if (!list.length) setMode("live");
      })
      .catch(() => setMode("live"));
  }, []);

  // Live: the browser subscribes to Polymarket's feed directly; every second the book is sampled.
  useEffect(() => {
    if (mode !== "live" || !marketId) return;
    const market = markets.find((m) => m.id === marketId);
    if (!market) return;
    engine.current = newEngine(questionsRef.current);
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setStatus("Loading recent fills...");
    recentTrades(market, 300)
      .then((t) => !closed && engine.current.detector.seed(t))
      .catch(() => undefined);
    const connect = () => {
      ws = new WebSocket(POLYMARKET_WS);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ assets_ids: [market.assetId, market.complementId].filter(Boolean), type: "market" }));
        setStatus("Live");
      };
      ws.onmessage = (m) => {
        for (const ev of parseMessage(String(m.data), market.assetId, market.complementId)) feed(ev);
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("Reconnecting...");
        retry = setTimeout(connect, 1_500);
      };
    };
    connect();
    const ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("PING"), 10_000);
    const tick = setInterval(() => {
      if (pausedRef.current) return;
      pushSample(Date.now());
      setTick((n) => n + 1);
    }, 1_000);
    return () => {
      closed = true;
      clearInterval(ping);
      clearInterval(tick);
      clearTimeout(retry);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [mode, marketId, markets, pushSample, feed]);

  // Replay: the recorded events in order on a simulated clock, sampled on the same one-second grid as live.
  useEffect(() => {
    if (mode !== "replay" || !recordingFile) return;
    engine.current = newEngine(questionsRef.current);
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    setStatus("Loading recording...");
    fetch(`/replays/${recordingFile}`)
      .then((r) => r.json())
      .then((rec: RecordingFile) => {
        if (stopped) return;
        const events = [...rec.events].sort((a, b) => a.t - b.t);
        engine.current.detector.seed(rec.seed ?? []);
        let simT = events[0]?.t ?? Date.parse(rec.startedAt);
        let next = Math.ceil(simT / 1_000) * 1_000;
        let i = 0;
        setStatus("Replaying");
        timer = setInterval(() => {
          if (pausedRef.current) return;
          simT += 100 * speedRef.current;
          while (i < events.length && events[i].t <= simT) feed(events[i++]);
          while (next <= simT) {
            pushSample(next);
            next += 1_000;
          }
          setTick((n) => n + 1);
          if (i >= events.length) {
            clearInterval(timer);
            setStatus("Replay finished");
          }
        }, 100);
      })
      .catch(() => setStatus("Could not load the recording"));
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [mode, recordingFile, pushSample, feed]);

  const e = engine.current;
  const stats = e.detector.stats();
  const ladder = e.detector.book.top(8);
  const maxSize = Math.max(1, ...ladder.bids.map((l) => l.size), ...ladder.asks.map((l) => l.size));
  const combined = e.alerts.find((a) => a.kind === "combined" && e.now - a.t < 120_000);
  const market = mode === "live" ? markets.find((m) => m.id === marketId) : null;
  const rec = recordings.find((r) => r.file === recordingFile);
  const chart = e.series.filter((s) => s.bid !== null && s.ask !== null).slice(-600);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xs border border-zinc-700 p-0.5" role="tablist" aria-label="Source">
          {(["replay", "live"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={m === "replay" && !recordings.length}
              onClick={() => {
                setMode(m);
                setPaused(false);
              }}
              className={`rounded-[2px] px-3 py-1 text-xs font-medium ${mode === m ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-100 disabled:opacity-40"}`}
            >
              {m === "live" ? "Live feed" : "Recorded session"}
            </button>
          ))}
        </div>
        {mode === "live" ? (
          <select value={marketId ?? ""} onChange={(ev) => setMarketId(ev.target.value)} className="max-w-full rounded-xs border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 sm:max-w-[420px]" aria-label="Market">
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.question}
              </option>
            ))}
          </select>
        ) : (
          <>
            <select value={recordingFile ?? ""} onChange={(ev) => setRecordingFile(ev.target.value)} className="max-w-full rounded-xs border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 sm:max-w-[420px]" aria-label="Recording">
              {recordings.map((r) => (
                <option key={r.file} value={r.file}>
                  {r.question} · {r.startedAt.slice(0, 16).replace("T", " ")} UTC
                </option>
              ))}
            </select>
            <div className="inline-flex items-center gap-1 text-xs text-zinc-400">
              {SPEEDS.map((s) => (
                <button key={s} type="button" onClick={() => setSpeed(s)} className={`rounded-xs px-1.5 py-0.5 font-mono ${speed === s ? "bg-zinc-800 text-zinc-50" : "hover:text-zinc-100"}`}>
                  {s}x
                </button>
              ))}
            </div>
          </>
        )}
        <button type="button" onClick={() => setPaused((p) => !p)} className="inline-flex items-center gap-1 rounded-xs border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500" aria-label={paused ? "Resume" : "Pause"}>
          {paused ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />} {paused ? "Resume" : "Pause"}
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
          <Radio className={`h-3 w-3 ${status === "Live" || status === "Replaying" ? "text-emerald-500" : "text-zinc-600"}`} aria-hidden />
          {status} · {e.events.toLocaleString()} events{e.now ? ` · ${clock(e.now)}` : ""}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {mode === "replay" && rec
          ? `Recorded from the live feed ${rec.startedAt.slice(0, 16).replace("T", " ")} to ${rec.endedAt.slice(11, 16)} UTC: ${rec.events.toLocaleString()} book and trade events, replayed in order on the same detectors.`
          : market
            ? (
                <>
                  Streaming straight from Polymarket into this browser.{" "}
                  <a href={market.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200">
                    Market <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </>
              )
            : null}
      </p>

      {combined ? (
        <div className="mt-4 rounded-xs border border-red-700 bg-red-950/40 p-3 text-sm text-red-200" role="status">
          <span className="font-semibold">Unusual activity at {clock(combined.t)}.</span> {combined.text}. Worth a look, not proof of informed trading: news, a rebalance or one
          large player look the same in the book.
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="surface rounded-xs border border-zinc-800 p-3" aria-label="Best bid and ask">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Best bid and ask, YES</p>
          <div className="mt-2 h-[300px]">
            {chart.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgb(var(--zinc-800))" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={clock} stroke="rgb(var(--zinc-600))" tick={{ fontSize: 10 }} minTickGap={60} />
                  <YAxis domain={["auto", "auto"]} tickFormatter={(v: number) => cents(v)} stroke="rgb(var(--zinc-600))" tick={{ fontSize: 10 }} width={52} />
                  <Tooltip
                    labelFormatter={(t) => clock(Number(t))}
                    formatter={(v) => cents(Number(v))}
                    contentStyle={{ background: "rgb(var(--zinc-950))", border: "1px solid rgb(var(--zinc-700))", fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="stepAfter" dataKey="ask" name="Best ask" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="bid" name="Best bid" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-20 text-center text-xs text-zinc-500">Waiting for the book...</p>
            )}
          </div>
        </section>

        <section className="surface rounded-xs border border-zinc-800 p-3 font-mono text-[11px]" aria-label="Order book">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Book, best 8 levels</p>
          <p className="font-sans text-[10px] text-zinc-500">Bars on a square-root scale, so one resting whale does not flatten the rest.</p>
          <div className="mt-2 space-y-px">
            {[...ladder.asks].reverse().map((l) => (
              <div key={`a${l.price}`} className="relative flex justify-between px-1.5 py-0.5">
                <span className="absolute inset-y-0 right-0 bg-red-600/15" style={{ width: `${Math.sqrt(l.size / maxSize) * 100}%` }} aria-hidden />
                <span className="relative text-red-400">{cents(l.price)}</span>
                <span className="relative text-zinc-300">{shares(l.size)}</span>
              </div>
            ))}
            <div className="border-y border-zinc-800 py-1 text-center text-zinc-500">
              spread {ladder.asks[0] && ladder.bids[0] ? cents(ladder.asks[0].price - ladder.bids[0].price) : "n/a"}
            </div>
            {ladder.bids.map((l) => (
              <div key={`b${l.price}`} className="relative flex justify-between px-1.5 py-0.5">
                <span className="absolute inset-y-0 right-0 bg-emerald-600/15" style={{ width: `${Math.sqrt(l.size / maxSize) * 100}%` }} aria-hidden />
                <span className="relative text-emerald-400">{cents(l.price)}</span>
                <span className="relative text-zinc-300">{shares(l.size)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Rolling statistics">
        <Tile label="Fill size, last 200" note="Mean from a running sum, O(1). Median from two heaps, O(log N).">
          <Pair a={["mean", shares(stats.meanSize)]} b={["median", shares(stats.medianSize)]} />
        </Tile>
        <Tile label="Spread of fill sizes" note="One whale fill inflates the standard deviation; the MAD barely moves, so the next one still stands out.">
          <Pair a={["std", shares(stats.stdSize)]} b={["MAD", shares(stats.madSize)]} />
        </Tile>
        <Tile label="Imbalance near the touch" note="Bid minus ask depth within 5¢ of the mid, over their sum.">
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-50">{stats.imbalance === null ? "n/a" : stats.imbalance.toFixed(2)}</div>
          <div className="relative mt-1 h-1.5 rounded-[2px] bg-zinc-800">
            <span className="absolute inset-y-0 left-1/2 w-px bg-zinc-500" aria-hidden />
            {stats.imbalance !== null ? (
              <span
                className={`absolute inset-y-0 rounded-[2px] ${stats.imbalance >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                style={stats.imbalance >= 0 ? { left: "50%", width: `${stats.imbalance * 50}%` } : { right: "50%", width: `${-stats.imbalance * 50}%` }}
              />
            ) : null}
          </div>
        </Tile>
        <Tile label="CUSUM on the mid" note={`Fires when either sum passes ${stats.cusum.threshold}; then both reset.`}>
          {(
            [
              ["up", stats.cusum.pos, "bg-emerald-500"],
              ["down", stats.cusum.neg, "bg-red-500"],
            ] as const
          ).map(([k, v, c]) => (
            <div key={k} className="mt-1 flex items-center gap-2 text-[11px]">
              <span className="w-8 text-zinc-500">{k}</span>
              <div className="h-1.5 flex-1 rounded-[2px] bg-zinc-800">
                <div className={`h-full rounded-[2px] ${c}`} style={{ width: `${Math.min(100, (v / stats.cusum.threshold) * 100)}%` }} />
              </div>
              <span className="w-8 text-right font-mono text-zinc-300">{v.toFixed(1)}</span>
            </div>
          ))}
        </Tile>
      </section>

      <LiveQuestions questions={questions} runners={e.rules} onAdd={addQuestion} onRemove={removeQuestion} />

      <section className="mt-6" aria-label="Alerts">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> Alerts · {e.alerts.length}
        </h2>
        {e.alerts.length ? (
          <ul className="mt-2 max-h-[280px] divide-y divide-zinc-800 overflow-y-auto rounded-xs border border-zinc-800">
            {e.alerts.map((a, i) => (
              <li key={`${a.t}-${a.kind}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-xs">
                <span className="font-mono text-zinc-500">{clock(a.t)}</span>
                <span className={`rounded-xs border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${KIND[a.kind].tone}`}>{KIND[a.kind].label}</span>
                <span className="min-w-0 flex-1 text-zinc-200">{a.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            None yet. The detectors warm up on the last 200 fills and a minute of book samples; quiet markets can stay quiet, which is the right answer.
          </p>
        )}
      </section>

      <HowItWorks />
    </div>
  );
}

function Tile({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="surface rounded-xs border border-zinc-800 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      {children}
      <p className="mt-2 text-[10.5px] leading-snug text-zinc-500">{note}</p>
    </div>
  );
}

function Pair({ a, b }: { a: [string, string]; b: [string, string] }) {
  return (
    <div className="mt-1 flex gap-4">
      {[a, b].map(([k, v]) => (
        <div key={k}>
          <span className="font-mono text-lg font-semibold text-zinc-50">{v}</span> <span className="text-[10px] text-zinc-500">{k}</span>
        </div>
      ))}
    </div>
  );
}

function HowItWorks() {
  const rows = [
    ["Rolling mean and variance", "Ring buffer, running sum and sum of squares", "O(1) per update", "Sums recomputed every 10,000 updates so float error cannot build up"],
    ["Rolling median", "Max-heap for the lower half, min-heap for the upper", "O(log N) update, O(1) read", "Lazy deletion: a value leaving the window is counted and popped when it reaches a top"],
    ["Outlier test", "Modified z-score, 0.6745 (x - median) / MAD", "O(N log N) per fill", "Flags above 3.5 (Iglewicz and Hoaglin); mean absolute deviation stands in when the MAD is zero"],
    ["Change point", "Two-sided CUSUM, k = 0.5, h = 5", "O(1) per sample", "About one false alarm in 465 steps of pure noise; a one-sigma shift caught in about ten"],
  ];
  return (
    <section className="mt-10 max-w-4xl">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> How it works
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-semibold">Statistic</th>
              <th className="py-2 pr-3 font-semibold">Structure</th>
              <th className="py-2 pr-3 font-semibold">Cost</th>
              <th className="py-2 font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t border-zinc-800 align-top">
                <td className="py-2 pr-3 text-zinc-100">{r[0]}</td>
                <td className="py-2 pr-3 text-zinc-300">{r[1]}</td>
                <td className="py-2 pr-3 font-mono text-zinc-300">{r[2]}</td>
                <td className="py-2 text-zinc-400">{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-zinc-400">
        <li>Each structure is unit-tested against a brute-force answer on thousands of random windows (lib/stream/stream.test.ts).</li>
        <li>
          The detectors are deterministic: the same events give the same alerts, so a recorded session replays exactly. Recordings are real feed captures
          (scripts/record-orderbook.ts), never generated.
        </li>
        <li>
          Prediction markets trade thinly, a few fills a minute on the busiest Fed contracts, so the trade-size window is warmed with the market&apos;s last 300 public fills.
        </li>
        <li>An alert says the book did something unusual. It cannot say why; it is a prompt to look, not evidence of informed trading.</li>
      </ul>
    </section>
  );
}
