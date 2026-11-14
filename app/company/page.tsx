"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeEvent, DevilsAdvocate, Entity, MeetingBrief, Report, Timeline, WatchCard, WatchlistResponse } from "@/types";
import { CommandPalette } from "@/components/command-palette";
import { PIPELINE_STEPS, PipelineProgress } from "@/components/layout/pipeline-progress";
import { StatusBar } from "@/components/layout/status-bar";
import { TabBar, type TabKey, isTab } from "@/components/layout/tab-bar";
import { DEFAULT_RANGE, type TimeRange, readRange, saveRange } from "@/lib/time-range";
import { TopBar } from "@/components/layout/top-bar";
import { EntityPanel } from "@/components/panel/entity-panel";
import { Tour } from "@/components/tour/tour";
import { CapitalTab } from "@/components/tabs/capital-tab";
import { ChangesTab } from "@/components/tabs/changes-tab";
import { FinancialTab } from "@/components/tabs/financial-tab";
import { GraphTab } from "@/components/tabs/graph-tab";
import { MemoTab } from "@/components/tabs/memo-tab";
import { SummaryTab } from "@/components/summary/summary-tab";
import { CommitteeRoom } from "@/components/committee/committee-room";
import { OwnerTab } from "@/components/contagion/owner-tab";
import { Toast } from "@/components/ui/toast";
import { DualVerdictBadge } from "@/components/ui/dual-verdict-badge";
import { concernCount, stanceWord } from "@/lib/counter-view";

type Status = "idle" | "loading" | "ready" | "error";

/** The saved TeraWulf report used as the worked example in the tour. */
const EXAMPLE_REPORT_ID = "36e359a9-052f-4e17-8afc-b29d2403f4c1";

/** The plain-English answer opens first; the committee and the rest are the deep dive. */
const DEFAULT_TAB: TabKey = "summary";

function isEvent(value: unknown): value is AnalyzeEvent {
  return typeof value === "object" && value !== null && "type" in value;
}

/** Reads an NDJSON stream of AnalyzeEvents, calling onEvent for each. Returns false if it ended without a result or error. */
async function readEvents(response: Response, onEvent: (event: AnalyzeEvent) => void): Promise<boolean> {
  if (!response.body) return false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event: unknown = JSON.parse(line);
      if (!isEvent(event)) continue;
      onEvent(event);
      if (event.type !== "step") finished = true;
    }
  }
  return finished;
}

export default function CompanyPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [step, setStep] = useState(PIPELINE_STEPS[0]);
  const [startedAt, setStartedAt] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareStep, setCompareStep] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(DEFAULT_TAB);
  const [changesSeen, setChangesSeen] = useState(false);
  // The map mounts the first time its tab is visible: React Flow measures its container on mount.
  const [graphMounted, setGraphMounted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [range, setRangeState] = useState<TimeRange>(DEFAULT_RANGE);
  // The window is shared by every tab and remembered across visits.
  useEffect(() => setRangeState(readRange()), []);
  const setRange = useCallback((next: TimeRange) => {
    setRangeState(next);
    saveRange(next);
  }, []);

  // The filing timeline is built on the server the first time a report is opened, then saved with it.
  const reportId = report?.id ?? null;
  useEffect(() => {
    setTimeline(null);
    setTimelineError(null);
    if (!reportId) return;
    let live = true;
    fetch(`/api/timeline?reportId=${encodeURIComponent(reportId)}`)
      .then(async (r) => {
        const body = (await r.json()) as { timeline?: Timeline; error?: string };
        if (!live) return;
        if (body.timeline) setTimeline(body.timeline);
        else setTimelineError(body.error ?? "The filing history could not be read.");
      })
      .catch(() => live && setTimelineError("The filing history could not be read."));
    return () => {
      live = false;
    };
  }, [reportId]);
  const analyzeRef = useRef<((ticker: string, fresh?: boolean) => Promise<void>) | null>(null);

  /** Switches view and records it in the URL, keeping the report and peers. */
  const openTab = useCallback((next: TabKey) => {
    setTab(next);
    if (next === "changes") setChangesSeen(true);
    if (next === "graph") setGraphMounted(true);
    const params = new URLSearchParams(window.location.search);
    if (next === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const showReport = useCallback((next: Report, wasCached: boolean) => {
    setReport(next);
    setCached(wasCached);
    setStatus("ready");
    setChangesSeen(false);
    const requested = new URLSearchParams(window.location.search).get("tab");
    const keep = isTab(requested) ? requested : DEFAULT_TAB;
    setTab(keep);
    setGraphMounted(keep === "graph");
    // A different company gets its own history entry, so Back returns to the previous one.
    const url = `?report=${next.id}${keep !== DEFAULT_TAB ? `&tab=${keep}` : ""}`;
    const current = new URLSearchParams(window.location.search);
    if (current.get("report") === next.id || current.has("ticker")) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, []);

  // Command palette on Cmd+K or Ctrl+K.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The URL drives the page: ?report=<id> opens a saved report, ?ticker= runs an analysis, nothing shows the home
  // screen. It is read on load and again on Back and Forward.
  const currentId = useRef<string | null>(null);
  currentId.current = report?.id ?? null;
  const loadFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("report");
    const tickerParam = params.get("ticker");
    if (!id && !tickerParam) {
      // The company view needs a report or a ticker; the radar is the home page.
      window.location.replace("/");
      return;
    }
    if (id && id === currentId.current) {
      const t = params.get("tab");
      const keep = isTab(t) ? t : DEFAULT_TAB;
      setTab(keep);
      if (keep === "graph") setGraphMounted(true);
      return;
    }
    if (!id && tickerParam && /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(tickerParam)) {
      // analyzeRef is filled by a later effect in the same commit, so wait for it.
      queueMicrotask(() => void analyzeRef.current?.(tickerParam.toUpperCase(), params.get("fresh") === "1"));
      return;
    }
    if (!id) return;
    setSelected(null);
    setStatus("loading");
    setStep(PIPELINE_STEPS[0]);
    setStartedAt(Date.now());
    fetch(`/api/report/${encodeURIComponent(id)}`)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (response.ok && typeof body === "object" && body !== null && "report" in body) {
          showReport((body as { report: Report }).report, true);
        } else {
          throw new Error("missing");
        }
      })
      .catch(() => {
        setError("This report link is no longer available. Enter a ticker to run a new analysis.");
        setStatus("error");
        window.history.replaceState(null, "", window.location.pathname);
      });
  }, [showReport]);

  useEffect(() => {
    loadFromUrl();
    window.addEventListener("popstate", loadFromUrl);
    return () => window.removeEventListener("popstate", loadFromUrl);
    // Read the URL once on load; later reads come from Back and Forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goHome = useCallback(() => {
    window.location.href = "/";
  }, []);

  const analyze = useCallback(
    async (ticker: string, fresh = false) => {
      setStatus("loading");
      setStep(PIPELINE_STEPS[0]);
      setStartedAt(Date.now());
      setError(null);
      setSelected(null);
      setCompareError(null);
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, fresh }),
        });
        const finished = await readEvents(response, (event) => {
          if (event.type === "step") setStep(event.step);
          if (event.type === "result") showReport(event.report, event.cached);
          if (event.type === "error") {
            setError(event.message);
            setStatus("error");
          }
        });
        if (!finished) throw new Error("Stream ended early");
      } catch {
        setError("The analysis stopped before it finished. Please try again.");
        setStatus("error");
      }
    },
    [showReport],
  );

  useEffect(() => {
    analyzeRef.current = analyze;
  }, [analyze]);

  const focusEntity = useCallback(
    (id: string) => {
      const entity = report?.graph.nodes.find((n) => n.id === id);
      if (!entity) return;
      setSelected(entity);
      openTab("graph");
      setFocusRequest((n) => n + 1);
    },
    [report, openTab],
  );

  const compare = useCallback(async () => {
    if (!report) return;
    setComparing(true);
    setCompareStep(null);
    setCompareError(null);
    try {
      const response = await fetch("/api/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      const finished = await readEvents(response, (event) => {
        if (event.type === "step") setCompareStep(event.step);
        if (event.type === "result") {
          setReport(event.report);
          setSelected(null);
        }
        if (event.type === "error") setCompareError(event.message);
      });
      if (!finished) throw new Error("Stream ended early");
    } catch {
      setCompareError("The comparison stopped before it finished. Please try again.");
    } finally {
      setComparing(false);
    }
  }, [report]);

  const prepareBrief = useCallback(async () => {
    if (!report) return;
    setBriefBusy(true);
    setBriefError(null);
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      const body: unknown = await response.json();
      if (!response.ok || typeof body !== "object" || body === null || !("brief" in body)) {
        throw new Error(typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : "");
      }
      const { brief } = body as { brief: MeetingBrief };
      setReport((current) => (current ? { ...current, brief } : current));
    } catch (error) {
      setBriefError(error instanceof Error && error.message ? error.message : "The brief could not be prepared. Please try again.");
    } finally {
      setBriefBusy(false);
    }
  }, [report]);

  const [devilBusy, setDevilBusy] = useState(false);
  const [devilError, setDevilError] = useState<string | null>(null);

  const argue = useCallback(async () => {
    if (!report) return;
    setDevilBusy(true);
    setDevilError(null);
    try {
      const response = await fetch("/api/devils-advocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      const body: unknown = await response.json();
      if (!response.ok || typeof body !== "object" || body === null || !("devil" in body)) {
        throw new Error(typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : "");
      }
      const { devil } = body as { devil: DevilsAdvocate };
      setReport((current) => (current ? { ...current, devil } : current));
    } catch (error) {
      setDevilError(error instanceof Error && error.message ? error.message : "The counter-argument could not be written. Please try again.");
    } finally {
      setDevilBusy(false);
    }
  }, [report]);

  // Every report gets its counter-argument as soon as it loads, so it is beside the memo and on every tab.
  const argued = useRef<string | null>(null);
  useEffect(() => {
    if (!report || status !== "ready" || devilBusy || argued.current === report.id) return;
    argued.current = report.id;
    // Counter-arguments written before the structured case are rewritten once.
    if (!report.devil?.sections) void argue();
  }, [report, status, devilBusy, argue]);

  // The watchlist queue: who is watched, and who needs attention (top bar count, home page).
  const [queue, setQueue] = useState<WatchCard[] | null>(null);
  const loadQueue = useCallback(async () => {
    try {
      const response = await fetch("/api/watchlist", { cache: "no-store" });
      const body = (await response.json()) as WatchlistResponse;
      if (response.ok && body.cards) setQueue(body.cards);
    } catch {
      // The queue is a convenience here; the watchlist page reports its own errors.
    }
  }, []);
  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);
  const watched = useMemo(() => new Set((queue ?? []).map((c) => c.ticker)), [queue]);
  const attention = (queue ?? []).filter((c) => c.status === "act" || c.status === "review").length;

  const toggleWatch = useCallback(
    async (ticker: string, add = !watched.has(ticker)) => {
      try {
        const response = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, action: add ? "add" : "remove" }),
        });
        setToast(response.ok ? (add ? `${ticker} is on your watchlist` : `${ticker} is off your watchlist`) : "The watchlist could not be updated.");
        if (response.ok) {
          // Show the change at once; the full queue (reasons, feed) follows.
          setQueue((q) => (add ? [...(q ?? []), { ticker } as WatchCard] : (q ?? []).filter((c) => c.ticker !== ticker)));
          void loadQueue();
        }
      } catch {
        setToast("The watchlist could not be updated.");
      }
    },
    [watched, loadQueue],
  );
  const watchCompany = useCallback((ticker: string) => toggleWatch(ticker, true), [toggleWatch]);

  // Presentation tour. It always runs on the example report, so its script matches the screen.
  const [tourStep, setTourStep] = useState<number | null>(null);
  const startTour = useCallback(() => {
    if (report?.id === EXAMPLE_REPORT_ID) {
      setSelected(null);
      setTourStep(0);
    } else {
      window.location.href = `/company?report=${EXAMPLE_REPORT_ID}&tour=1`;
    }
  }, [report?.id]);
  // "?tour=1" is read once on arrival, because loading the report rewrites the URL.
  const tourRequested = useRef(false);
  useEffect(() => {
    tourRequested.current = new URLSearchParams(window.location.search).get("tour") === "1";
  }, []);
  useEffect(() => {
    if (status !== "ready" || !report || !tourRequested.current) return;
    tourRequested.current = false;
    setTourStep(0);
  }, [status, report]);

  const showCapital = useCallback(() => {
    setSelected(null);
    openTab("capital");
  }, [openTab]);

  const graph = report?.graph ?? null;
  const totalDebt = report?.capital?.metrics.find((m) => m.key === "total_debt")?.display ?? null;
  const factChanges = report?.changes?.changes.filter((c) => !c.judgment).length ?? 0;
  const periodic = report?.sources
    .filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const asOf = periodic ? `As of ${periodic.fiscalPeriod ?? periodic.sourceType} · ${periodic.sourceType} filed ${periodic.date}` : null;
  const ready = Boolean(graph && report && status !== "loading");

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <TopBar
        busy={status === "loading"}
        changes={ready ? factChanges : 0}
        hasReport={ready}
        onAnalyze={(t) => void analyze(t)}
        onOpenChanges={() => openTab("changes")}
        onOpenPalette={() => setPaletteOpen(true)}
        onHome={goHome}
        attention={attention}
        onTour={startTour}
        watch={
          ready && report
            ? { ticker: report.graph.company.ticker, watched: watched.has(report.graph.company.ticker), onToggle: () => void toggleWatch(report.graph.company.ticker) }
            : null
        }
        verdict={
          ready && report ? (
            <DualVerdictBadge memoVerdict={stanceWord(report.devil)} concernCount={concernCount(report.devil)} busy={devilBusy} onClick={() => openTab("memo")} />
          ) : null
        }
      />

      {ready && graph && report ? (
        <>
          <TabBar
            active={tab}
            onChange={openTab}
            empty={{ changes: !report.changes }}
            dot={{ changes: factChanges > 0 && !changesSeen, owner: report.sponsor?.flag === "watch" || report.sponsor?.flag === "target" }}
          />
          <main className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              {graphMounted ? (
                <div role="tabpanel" id="panel-graph" aria-labelledby="tab-graph" className={`h-full ${tab === "graph" ? "" : "hidden"}`}>
                  <GraphTab
                    graph={graph}
                    totalDebt={totalDebt && totalDebt !== "Not available" ? totalDebt : null}
                    notes={report.notes}
                    selectedId={selected?.id ?? null}
                    focusRequest={focusRequest}
                    onSelect={setSelected}
                    onClearSelection={() => setSelected(null)}
                    timeline={timeline}
                    timelineError={timelineError}
                    range={range}
                    onRangeChange={setRange}
                    asOf={asOf}
                    devil={report.devil}
                    devilBusy={devilBusy}
                    capital={report.capital ?? null}
                  />
                </div>
              ) : null}
              {tab !== "graph" ? (
                <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="h-full overflow-y-auto">
                  {tab === "summary" ? <SummaryTab report={report} onTab={openTab} /> : null}
                  {tab === "committee" ? <CommitteeRoom report={report} /> : null}
                  {tab === "owner" ? <OwnerTab report={report} /> : null}
                  {tab === "financial" ? <FinancialTab report={report} timeline={timeline} range={range} devilBusy={devilBusy} /> : null}
                  {tab === "capital" ? <CapitalTab report={report} devilBusy={devilBusy} /> : null}
                  {tab === "changes" ? (
                    <ChangesTab
                      report={report}
                      busy={comparing}
                      step={compareStep}
                      error={compareError}
                      onCompare={() => void compare()}
                      onSelectEntity={focusEntity}
                      timeline={timeline}
                      devilBusy={devilBusy}
                    />
                  ) : null}
                  {tab === "memo" ? (
                    <MemoTab
                      report={report}
                      briefBusy={briefBusy}
                      briefError={briefError}
                      onPrepareBrief={() => void prepareBrief()}
                    devilBusy={devilBusy}
                    devilError={devilError}
                    onArgue={() => void argue()}
                      onEntityClick={focusEntity}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </main>
          {tourStep !== null && ready ? (
            <Tour step={tourStep} onStep={setTourStep} onClose={() => setTourStep(null)} onTab={openTab} activeTab={tab} />
          ) : null}
          <StatusBar
            report={report}
            cached={cached}
            onWatch={() => void watchCompany(report.graph.company.ticker)}
            onRefresh={() => void analyze(report.graph.company.ticker, true)}
          />
          <CommandPalette
            open={paletteOpen}
            reportId={report.id}
            ticker={graph.company.ticker}
            nodes={graph.nodes}
            onClose={closePalette}
            onEntityClick={focusEntity}
            onCapitalClick={showCapital}
          />
        </>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          {status === "loading" ? (
            <div className="px-6 py-6">
              <PipelineProgress step={step} startedAt={startedAt} />
            </div>
          ) : null}
          {status === "error" && error ? (
            <p className="px-6 py-6 text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          {status === "idle" ? (
            <p className="px-6 py-6 text-sm text-zinc-500">
              Opening the radar&hellip;
            </p>
          ) : null}
        </main>
      )}

      <EntityPanel
        entity={selected}
        companyName={graph?.company.name ?? ""}
        graph={graph}
        capital={report?.capital}
        onSelectEntity={focusEntity}
        onShowCapital={showCapital}
        onClose={() => setSelected(null)}
        onToast={setToast}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
