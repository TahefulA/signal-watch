"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeEvent, Entity, MeetingBrief, PeerComparison, Report } from "@/types";
import { MeetingPrepPanel } from "@/components/brief/meeting-prep-panel";
import { CapitalStructurePanel } from "@/components/capital/capital-structure-panel";
import { ChangePanel } from "@/components/changes/change-panel";
import { TickerInput } from "@/components/input/ticker-input";
import { Header } from "@/components/layout/header";
import { PIPELINE_STEPS, StatusBar } from "@/components/layout/status-bar";
import { EntityMap } from "@/components/map/entity-map";
import { Legend } from "@/components/map/legend";
import { MemoContainer } from "@/components/memo/memo-container";
import { EntityPanel } from "@/components/panel/entity-panel";
import { PeerPanel } from "@/components/peers/peer-panel";
import { Toast } from "@/components/ui/toast";
import { type EntityLink, viewGraph } from "@/lib/graph-view";
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

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
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
  const mapRef = useRef<HTMLElement>(null);
  const capitalRef = useRef<HTMLElement>(null);

  const showReport = useCallback((next: Report, wasCached: boolean) => {
    setReport(next);
    setCached(wasCached);
    setStatus("ready");
    window.history.replaceState(null, "", `?report=${next.id}`);
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
    window.history.replaceState(null, "", `?report=${subjectId}&peers=${peers.map((p) => p.id).join(",")}`);
  }, []);

  // Reopen a saved report from a shared link, e.g. ?report=<id>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("report");
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

  const focusEntity = useCallback(
    (id: string) => {
      const entity = report?.graph.nodes.find((n) => n.id === id);
      if (!entity) return;
      setSelected(entity);
      setFocusRequest((n) => n + 1);
      mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [report],
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

  const showCapital = useCallback(() => {
    setSelected(null);
    capitalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const graph = report?.graph ?? null;
  const totalDebt = report?.capital?.metrics.find((m) => m.key === "total_debt")?.display ?? null;
  const links = useMemo(() => (graph ? viewGraph(graph).links : new Map<string, EntityLink[]>()), [graph]);

  return (
    <div className="min-h-screen">
      <Header />

      <section className="border-b border-zinc-800 px-6 py-4">
        <div className="flex min-h-[80px] flex-col justify-center gap-3">
          <TickerInput busy={status === "loading"} onSubmit={(t) => void analyze(t)} />
          {status === "loading" ? <StatusBar step={step} startedAt={startedAt} /> : null}
          {status === "error" && error ? <p className="text-sm text-red-400" role="alert">{error}</p> : null}
          {status === "ready" && report ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span className="font-mono text-zinc-300">{report.graph.company.ticker}</span>
              <span>
                {report.filingsAnalyzed} filings and {report.newsAnalyzed} headlines read, {report.graph.nodes.length - 1} entities
                with sources
              </span>
              <span>{cached ? `Saved report from ${ago(report.generatedAt)}` : `Generated ${ago(report.generatedAt)}`}</span>
              {cached ? (
                <button
                  type="button"
                  onClick={() => void analyze(report.graph.company.ticker, true)}
                  className="text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-50"
                >
                  Read the filings again
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      {status === "idle" ? (
        <section className="max-w-2xl px-6 py-8 text-sm leading-relaxed text-zinc-400">
          <p>
            Enter a ticker to read the company&rsquo;s latest 10-K, 10-Q and 8-K, its recent headlines and 90 days of
            market data. Signal Watch maps every counterparty, financing, regulator and risk it finds, with the sentence
            each one came from, and drafts a five-part credit memo underneath.
          </p>
          <p className="mt-3 text-zinc-500">
            Analysis takes 15 to 40 seconds. Each box on the map opens the filing sentence it is based on.
          </p>
        </section>
      ) : null}

      {graph && report && status !== "loading" ? (
        <>
          <section ref={mapRef} className="scroll-mt-4 px-6 py-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Entity map</h2>
              <Legend />
            </div>
            <ChangePanel
              changes={report.changes}
              busy={comparing}
              step={compareStep}
              error={compareError}
              onCompare={() => void compare()}
              onSelectEntity={focusEntity}
            />
            {report.notes.map((note) => (
              <p key={note} className="mb-3 text-sm text-amber-500">
                {note}
              </p>
            ))}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="h-[70vh] min-h-[480px] border border-zinc-800">
                <EntityMap
                  graph={graph}
                  totalDebt={totalDebt !== "Not available" ? totalDebt : null}
                  selectedId={selected?.id ?? null}
                  focusRequest={focusRequest}
                  onSelect={setSelected}
                />
              </div>
              <CapitalStructurePanel
                ref={capitalRef}
                capital={report.capital}
                className="scroll-mt-4 xl:h-[70vh] xl:min-h-[480px] xl:overflow-y-auto"
              />
            </div>
          </section>
          <MemoContainer
            memo={report.memo}
            company={graph.company}
            generatedAt={report.generatedAt}
            sourceCount={report.sources.length}
            onEntityClick={focusEntity}
          />
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
          <MeetingPrepPanel
            report={report}
            busy={briefBusy}
            error={briefError}
            hasPeers={peerReports.length > 0}
            onPrepare={() => void prepareBrief()}
          />
        </>
      ) : null}

      <EntityPanel
        entity={selected}
        companyName={graph?.company.name ?? ""}
        links={selected ? (links.get(selected.id) ?? []) : []}
        nodes={graph?.nodes ?? []}
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
