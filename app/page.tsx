"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeEvent, Entity, MeetingBrief, PeerComparison, Report } from "@/types";
import { CommandPalette } from "@/components/command-palette";
import { PIPELINE_STEPS, PipelineProgress } from "@/components/layout/pipeline-progress";
import { StatusBar } from "@/components/layout/status-bar";
import { TabBar, type TabKey, isTab } from "@/components/layout/tab-bar";
import { TopBar } from "@/components/layout/top-bar";
import { EntityPanel } from "@/components/panel/entity-panel";
import { PeerPanel } from "@/components/peers/peer-panel";
import { CapitalTab } from "@/components/tabs/capital-tab";
import { ChangesTab } from "@/components/tabs/changes-tab";
import { FinancialTab } from "@/components/tabs/financial-tab";
import { GraphTab } from "@/components/tabs/graph-tab";
import { MemoTab } from "@/components/tabs/memo-tab";
import { Toast } from "@/components/ui/toast";
import { peerContextFor } from "@/lib/peer-view";

type Status = "idle" | "loading" | "ready" | "error";

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

export default function HomePage() {
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
  const [peerComparison, setPeerComparison] = useState<PeerComparison | null>(null);
  const [peerReports, setPeerReports] = useState<Report[]>([]);
  const [peerBusy, setPeerBusy] = useState(false);
  const [peerStep, setPeerStep] = useState<string | null>(null);
  const [peerError, setPeerError] = useState<string | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("graph");
  const [changesSeen, setChangesSeen] = useState(false);
  // The map mounts the first time its tab is visible: React Flow measures its container on mount.
  const [graphMounted, setGraphMounted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const analyzeRef = useRef<((ticker: string, fresh?: boolean) => Promise<void>) | null>(null);

  /** Switches view and records it in the URL, keeping the report and peers. */
  const openTab = useCallback((next: TabKey) => {
    setTab(next);
    if (next === "changes") setChangesSeen(true);
    if (next === "graph") setGraphMounted(true);
    const params = new URLSearchParams(window.location.search);
    if (next === "graph") params.delete("tab");
    else params.set("tab", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const showReport = useCallback((next: Report, wasCached: boolean) => {
    setReport(next);
    setCached(wasCached);
    setStatus("ready");
    setChangesSeen(false);
    const requested = new URLSearchParams(window.location.search).get("tab");
    const keep = isTab(requested) ? requested : "graph";
    setTab(keep);
    setGraphMounted(keep === "graph");
    window.history.replaceState(null, "", `?report=${next.id}${keep !== "graph" ? `&tab=${keep}` : ""}`);
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

  /** Builds the comparison from saved report ids and records the peers in the URL. */
  const loadPeerComparison = useCallback(async (subjectId: string, peerIds: string[]) => {
    const response = await fetch("/api/peers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: subjectId, peerReportIds: peerIds }),
    });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== "object" || body === null || !("comparison" in body)) {
      const message = typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : null;
      throw new Error(message ?? "The comparison could not be built. Please try again.");
    }
    const { comparison, peers } = body as {
      comparison: PeerComparison;
      peers: Report[];
    };
    setPeerComparison(comparison);
    setPeerReports(peers);
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    window.history.replaceState(
      null,
      "",
      `?report=${subjectId}&peers=${peers.map((p) => p.id).join(",")}${tabParam ? `&tab=${tabParam}` : ""}`,
    );
  }, []);

  // Reopen a saved report from a shared link, e.g. ?report=<id>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("report");
    const tickerParam = params.get("ticker");
    if (!id && tickerParam && /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(tickerParam)) {
      // analyzeRef is filled by a later effect in the same commit, so wait for it.
      queueMicrotask(() => void analyzeRef.current?.(tickerParam.toUpperCase(), params.get("fresh") === "1"));
      return;
    }
    const peerIds = (params.get("peers") ?? "").split(",").filter((p) => /^[0-9a-f-]{36}$/i.test(p));
    if (!id) return;
    setStatus("loading");
    setStep(PIPELINE_STEPS[0]);
    setStartedAt(Date.now());
    fetch(`/api/report/${encodeURIComponent(id)}`)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (response.ok && typeof body === "object" && body !== null && "report" in body) {
          showReport((body as { report: Report }).report, true);
          if (peerIds.length > 0) {
            loadPeerComparison(id, peerIds).catch(() =>
              setPeerError("The saved peer comparison could not be loaded. Compare again below."),
            );
          }
        } else {
          throw new Error("missing");
        }
      })
      .catch(() => {
        setError("This report link is no longer available. Enter a ticker to run a new analysis.");
        setStatus("error");
        window.history.replaceState(null, "", window.location.pathname);
      });
  }, [showReport, loadPeerComparison]);

  const analyze = useCallback(
    async (ticker: string, fresh = false) => {
      setStatus("loading");
      setStep(PIPELINE_STEPS[0]);
      setStartedAt(Date.now());
      setError(null);
      setSelected(null);
      setCompareError(null);
      setPeerComparison(null);
      setPeerReports([]);
      setPeerError(null);
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

  const comparePeerTickers = useCallback(
    async (tickers: string[]) => {
      if (!report) return;
      setPeerBusy(true);
      setPeerError(null);
      try {
        const ids: string[] = [];
        for (const ticker of tickers) {
          setPeerStep(`${ticker}: starting...`);
          let failure: string | null = null;
          const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker }),
          });
          await readEvents(response, (event) => {
            if (event.type === "step") setPeerStep(`${ticker}: ${event.step}`);
            if (event.type === "result") ids.push(event.report.id);
            if (event.type === "error") failure = `${ticker}: ${event.message}`;
          });
          if (failure) throw new Error(failure);
        }
        setPeerStep("Matching entities and searching each company's filings...");
        await loadPeerComparison(report.id, ids);
      } catch (error) {
        setPeerError(error instanceof Error ? error.message : "The comparison could not be built. Please try again.");
      } finally {
        setPeerBusy(false);
        setPeerStep(null);
      }
    },
    [report, loadPeerComparison],
  );

  const peerContext = useMemo(
    () =>
      selected && peerComparison && report?.graph.nodes.some((n) => n.id === selected.id)
        ? peerContextFor(selected, peerComparison, peerReports)
        : null,
    [selected, peerComparison, peerReports, report],
  );

  const prepareBrief = useCallback(async () => {
    if (!report) return;
    setBriefBusy(true);
    setBriefError(null);
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          peerReportIds: peerReports.map((p) => p.id),
        }),
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
  }, [report, peerReports]);

  const watchCompany = useCallback(async (ticker: string) => {
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, action: "add" }),
      });
      setToast(response.ok ? `${ticker} is on the dashboard` : "The dashboard could not be updated.");
    } catch {
      setToast("The dashboard could not be updated.");
    }
  }, []);

  const showCapital = useCallback(() => {
    setSelected(null);
    openTab("capital");
  }, [openTab]);

  const graph = report?.graph ?? null;
  const totalDebt = report?.capital?.metrics.find((m) => m.key === "total_debt")?.display ?? null;
  const factChanges = report?.changes?.changes.filter((c) => !c.judgment).length ?? 0;
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
      />

      {ready && graph && report ? (
        <>
          <TabBar
            active={tab}
            onChange={openTab}
            empty={{
              peers: peerReports.length === 0,
              changes: !report.changes,
            }}
            dot={{ changes: factChanges > 0 && !changesSeen }}
          />
          <main className="relative min-h-0 flex-1">
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
                />
              </div>
            ) : null}
            {tab !== "graph" ? (
              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="h-full overflow-y-auto">
                {tab === "financial" ? <FinancialTab report={report} peers={peerReports} /> : null}
                {tab === "capital" ? <CapitalTab report={report} /> : null}
                {tab === "changes" ? (
                  <ChangesTab
                    report={report}
                    busy={comparing}
                    step={compareStep}
                    error={compareError}
                    onCompare={() => void compare()}
                    onSelectEntity={focusEntity}
                  />
                ) : null}
                {tab === "peers" ? (
                  <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-12">
                    <PeerPanel
                      subject={report}
                      comparison={peerComparison}
                      peers={peerReports}
                      busy={peerBusy}
                      step={peerStep}
                      error={peerError}
                      onCompare={(tickers) => void comparePeerTickers(tickers)}
                      onSelectEntity={focusEntity}
                      onSelectPeerEntity={setSelected}
                    />
                  </div>
                ) : null}
                {tab === "memo" ? (
                  <MemoTab
                    report={report}
                    briefBusy={briefBusy}
                    briefError={briefError}
                    onPrepareBrief={() => void prepareBrief()}
                    onEntityClick={focusEntity}
                  />
                ) : null}
              </div>
            ) : null}
          </main>
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
            <section className="max-w-2xl px-6 py-10 text-sm leading-relaxed text-zinc-400">
              <p>
                Enter a ticker to read the company&rsquo;s latest 10-K, 10-Q and 8-K, its recent headlines and 90 days of market data.
                Signal Watch maps every counterparty, financing, regulator and risk it finds, with the sentence each one came from.
              </p>
              <p className="mt-3 text-zinc-500">
                Analysis takes 15 to 40 seconds. Each box on the map opens the filing sentence it is based on.
              </p>
            </section>
          ) : null}
        </main>
      )}

      <EntityPanel
        entity={selected}
        companyName={graph?.company.name ?? ""}
        graph={graph}
        capital={report?.capital}
        peerContext={peerContext}
        onSelectEntity={focusEntity}
        onShowCapital={showCapital}
        onClose={() => setSelected(null)}
        onToast={setToast}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
