"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeEvent, Entity, MeetingBrief, PeerComparison, Report } from "@/types";
import { MeetingPrepPanel } from "@/components/brief/meeting-prep-panel";
import { ChangePanel } from "@/components/changes/change-panel";
import { TickerInput } from "@/components/input/ticker-input";
import { Header } from "@/components/layout/header";
import { PIPELINE_STEPS, StatusBar } from "@/components/layout/status-bar";
import { EntityMap, type MapFilters } from "@/components/map/entity-map";
import { Legend } from "@/components/map/legend";
import { MemoContainer } from "@/components/memo/memo-container";
import { EntityPanel } from "@/components/panel/entity-panel";
import { PeerPanel } from "@/components/peers/peer-panel";
import { CompanyHeader } from "@/components/report/company-header";
import { EntityTable } from "@/components/report/entity-table";
import { FinancialsTab } from "@/components/report/financials-tab";
import { OverviewTab } from "@/components/report/overview-tab";
import { ReportTabs, type TabKey, isTab } from "@/components/report/report-tabs";
import { SourcesTab } from "@/components/report/sources-tab";
import { TabIntro } from "@/components/ui/section";
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
  const [mapFilters, setMapFilters] = useState<MapFilters>({ types: [], severities: [], highConfidenceOnly: false });
  const [briefError, setBriefError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [mapVisited, setMapVisited] = useState(false);
  const [mapView, setMapView] = useState<"map" | "table">("map");
  const analyzeRef = useRef<((ticker: string, fresh?: boolean) => Promise<void>) | null>(null);

  /** Switches tab and records it in the URL, keeping the report and peers. */
  const openTab = useCallback((next: TabKey) => {
    setTab(next);
    if (next === "map") setMapVisited(true);
    const params = new URLSearchParams(window.location.search);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const showReport = useCallback((next: Report, wasCached: boolean) => {
    setReport(next);
    setCached(wasCached);
    setStatus("ready");
    const requested = new URLSearchParams(window.location.search).get("tab");
    const keep = isTab(requested) ? requested : "overview";
    setTab(keep);
    setMapVisited(keep === "map");
    window.history.replaceState(null, "", `?report=${next.id}${keep !== "overview" ? `&tab=${keep}` : ""}`);
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
    const { comparison, peers } = body as { comparison: PeerComparison; peers: Report[] };
    setPeerComparison(comparison);
    setPeerReports(peers);
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    window.history.replaceState(null, "", `?report=${subjectId}&peers=${peers.map((p) => p.id).join(",")}${tabParam ? `&tab=${tabParam}` : ""}`);
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
            loadPeerComparison(id, peerIds).catch(() => setPeerError("The saved peer comparison could not be loaded. Compare again below."));
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

  const analyze = useCallback(async (ticker: string, fresh = false) => {
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
  }, [showReport]);

  useEffect(() => {
    analyzeRef.current = analyze;
  }, [analyze]);

  const focusEntity = useCallback(
    (id: string) => {
      const entity = report?.graph.nodes.find((n) => n.id === id);
      if (!entity) return;
      setSelected(entity);
      setMapView("map");
      openTab("map");
      setFocusRequest((n) => n + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
        body: JSON.stringify({ reportId: report.id, peerReportIds: peerReports.map((p) => p.id) }),
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
    openTab("financials");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [openTab]);

  const graph = report?.graph ?? null;
  const totalDebt = report?.capital?.metrics.find((m) => m.key === "total_debt")?.display ?? null;
  const factChanges = report?.changes?.changes.filter((c) => !c.judgment).length ?? null;

  return (
    <div className="min-h-screen">
      <Header active="analyze">
        <TickerInput busy={status === "loading"} onSubmit={(t) => void analyze(t)} />
      </Header>

      {status === "loading" ? (
        <section className="border-b border-zinc-800 px-6 py-4">
          <StatusBar step={step} startedAt={startedAt} />
        </section>
      ) : null}
      {status === "error" && error ? (
        <p className="border-b border-zinc-800 px-6 py-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {status === "idle" ? (
        <section className="max-w-2xl px-6 py-10 text-sm leading-relaxed text-zinc-400">
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-50">Credit research from the filings, with a receipt for every claim</h1>
          <p className="mt-4">
            Enter a ticker to read the company&rsquo;s latest 10-K, 10-Q and 8-K, its recent headlines and 90 days of
            market data. Signal Watch maps every counterparty, financing, regulator and risk it finds, with the sentence
            each one came from, builds the capital structure from the debt note and drafts a credit memo and meeting brief.
          </p>
          <p className="mt-3 text-zinc-500">
            Analysis takes 15 to 40 seconds. Saved companies are on the{" "}
            <a href="/dashboard" className="text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-50">
              dashboard
            </a>
            .
          </p>
        </section>
      ) : null}

      {graph && report && status !== "loading" ? (
        <>
          <CompanyHeader
            report={report}
            cached={cached}
            onWatch={() => void watchCompany(report.graph.company.ticker)}
            onRefresh={() => void analyze(report.graph.company.ticker, true)}
          />
          <ReportTabs
            active={tab}
            onChange={openTab}
            badges={{
              map: String(graph.nodes.length - 1),
              changes: factChanges === null ? null : String(factChanges),
              peers: peerReports.length ? peerReports.map((p) => p.graph.company.ticker).join(", ") : null,
              brief: report.brief ? "Ready" : null,
              sources: String(report.sources.length),
            }}
          />

          <main className="px-6 py-6">
            {tab === "overview" ? (
              <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
                <OverviewTab report={report} onSelectEntity={setSelected} onFocusEntity={focusEntity} onOpenTab={openTab} />
              </div>
            ) : null}

            {mapVisited ? (
              <div role="tabpanel" id="panel-map" aria-labelledby="tab-map" hidden={tab !== "map"}>
                <TabIntro
                  title="Entity map"
                  actions={
                    <div className="inline-flex rounded-sm border border-zinc-700 p-0.5" role="group" aria-label="View">
                      {(["map", "table"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={mapView === v}
                          onClick={() => setMapView(v)}
                          className={`rounded-xs px-3 py-1 text-xs ${mapView === v ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}
                        >
                          {v === "map" ? "Map" : "Table"}
                        </button>
                      ))}
                    </div>
                  }
                >
                  Everything the filings say {graph.company.name} depends on or is exposed to. Hover a box to isolate its links, click it for
                  the quote; the legend filters by type and severity. The table view exports every entity with its quote.
                </TabIntro>
                {report.notes.map((note) => (
                  <p key={note} className="mb-3 text-sm text-amber-500">
                    {note}
                  </p>
                ))}
                <div hidden={mapView !== "map"}>
                  <div className="mb-3">
                    <Legend filters={mapFilters} onChange={setMapFilters} />
                  </div>
                  <div className="h-[78vh] min-h-[560px] rounded-xs border border-zinc-800">
                    <EntityMap
                      graph={graph}
                      filters={mapFilters}
                      onClearSelection={() => setSelected(null)}
                      totalDebt={totalDebt !== "Not available" ? totalDebt : null}
                      selectedId={selected?.id ?? null}
                      focusRequest={focusRequest}
                      onSelect={setSelected}
                    />
                  </div>
                </div>
                {mapView === "table" ? <EntityTable report={report} onSelect={setSelected} /> : null}
              </div>
            ) : null}

            {tab === "financials" ? (
              <div role="tabpanel" id="panel-financials" aria-labelledby="tab-financials">
                <TabIntro title="Financials">
                  Earnings, leverage, coverage and liquidity from the company&rsquo;s own XBRL data; the debt stack and maturity wall from
                  its debt note; and the equity cushion at today&rsquo;s share price. Hover any figure for how it was built.
                </TabIntro>
                <FinancialsTab report={report} peers={peerReports} />
              </div>
            ) : null}

            {tab === "changes" ? (
              <div role="tabpanel" id="panel-changes" aria-labelledby="tab-changes">
                <TabIntro title="Changes since the previous quarter">
                  The map rebuilt from the filings available the day before the newest 10-Q or 10-K, then compared. A name counts as
                  new only if the earlier filings never mention it; figures are compared only when both quotes describe the same thing.
                </TabIntro>
                <ChangePanel
                  changes={report.changes}
                  busy={comparing}
                  step={compareStep}
                  error={compareError}
                  onCompare={() => void compare()}
                  onSelectEntity={focusEntity}
                />
              </div>
            ) : null}

            {tab === "peers" ? (
              <div role="tabpanel" id="panel-peers" aria-labelledby="tab-peers">
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
              <div role="tabpanel" id="panel-memo" aria-labelledby="tab-memo">
                <MemoContainer
                  memo={report.memo}
                  company={graph.company}
                  generatedAt={report.generatedAt}
                  sourceCount={report.sources.length}
                  onEntityClick={focusEntity}
                  nodes={graph.nodes}
                />
              </div>
            ) : null}

            {tab === "brief" ? (
              <div role="tabpanel" id="panel-brief" aria-labelledby="tab-brief">
                <MeetingPrepPanel
                  report={report}
                  busy={briefBusy}
                  error={briefError}
                  hasPeers={peerReports.length > 0}
                  onPrepare={() => void prepareBrief()}
                />
              </div>
            ) : null}

            {tab === "sources" ? (
              <div role="tabpanel" id="panel-sources" aria-labelledby="tab-sources">
                <TabIntro title="Sources and audit trail">
                  Every document read, what verification kept and dropped, and the rules applied. Everything on the other tabs traces back here.
                </TabIntro>
                <SourcesTab report={report} />
              </div>
            ) : null}
          </main>
        </>
      ) : null}

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
