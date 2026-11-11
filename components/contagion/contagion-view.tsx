"use client";

import { Background, BackgroundVariant, Controls, type Edge, Handle, type Node, type NodeProps, Position, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { ContagionAssessment, ContagionCompany, ContagionFlag, ContagionMap } from "@/types";
import { ContagionPanel } from "./contagion-panel";
import { compactMoney } from "@/lib/node-visuals";

export const FLAG_STYLE: Record<ContagionFlag, { label: string; border: string; text: string; fill: string }> = {
  target: { label: "Likely next target", border: "border-red-600", text: "text-red-500", fill: "#dc2626" },
  watch: { label: "Watch", border: "border-amber-500", text: "text-amber-500", fill: "#f59e0b" },
  clear: { label: "Clear", border: "border-emerald-600", text: "text-emerald-500", fill: "#10b981" },
  history: { label: "No longer files", border: "border-zinc-600", text: "text-zinc-400", fill: "rgb(var(--zinc-500))" },
};

const EVENT_TEXT = { bankruptcy: "Chapter 11", restructuring: "RSA", lme: "LME" } as const;

interface CompanyData extends Record<string, unknown> {
  company: ContagionCompany;
  assessment: ContagionAssessment;
  size: number;
  selected: boolean;
}
interface SponsorData extends Record<string, unknown> {
  name: string;
  count: number;
  primary: boolean;
}
type CompanyNode = Node<CompanyData, "company">;
type SponsorNode = Node<SponsorData, "sponsor">;

const hidden = "!h-1 !w-1 !border-0 !bg-transparent !min-w-0 !min-h-0";

const CompanyBox = memo(function CompanyBox({ data }: NodeProps<CompanyNode>) {
  const { company: c, assessment: a, size, selected } = data;
  const style = FLAG_STYLE[a.flag];
  const lastEvent = c.events.at(-1);
  return (
    <div className="relative flex flex-col items-center" style={{ width: 150 }}>
      <Handle type="target" position={Position.Top} className={hidden} style={{ top: size / 2 }} />
      <Handle type="source" position={Position.Bottom} className={hidden} style={{ top: size / 2 }} />
      <div className="relative" style={{ width: size, height: size }}>
        {a.flag === "target" ? <span className="threat-pulse absolute inset-0 rounded-full border-2 border-red-600" aria-hidden /> : null}
        <div
          className={`surface flex h-full w-full items-center justify-center rounded-full border-2 ${style.border} ${selected ? "ring-2 ring-zinc-200 ring-offset-2 ring-offset-zinc-950" : ""}`}
          style={{ background: a.flag === "target" ? "var(--devil-bg)" : undefined }}
        >
          <span className="px-1 text-center font-mono text-[10px] leading-tight text-zinc-300">{c.debt ? compactMoney(c.debt.value) : "n/a"}</span>
        </div>
        {lastEvent ? (
          <span className="absolute -right-2 -top-1 rounded-xs bg-zinc-800 px-1 font-mono text-[9px] font-semibold text-red-400" title={`${lastEvent.term}, ${lastEvent.date}`}>
            {EVENT_TEXT[lastEvent.kind]} {lastEvent.date.slice(0, 4)}
          </span>
        ) : null}
      </div>
      <span className="mt-1 line-clamp-2 text-center text-[11px] font-medium leading-tight text-zinc-100">{c.name}</span>
      <span className={`text-[9px] font-semibold uppercase tracking-wider ${style.text}`}>{style.label}</span>
    </div>
  );
});

const SponsorBox = memo(function SponsorBox({ data }: NodeProps<SponsorNode>) {
  return (
    <div className={`surface flex flex-col items-center justify-center rounded-xs border-2 ${data.primary ? "border-zinc-300 px-4 py-3" : "border-zinc-700 px-2 py-1.5"}`}>
      <Handle type="source" position={Position.Bottom} className={hidden} style={{ top: "50%" }} />
      <Handle type="target" position={Position.Top} className={hidden} style={{ top: "50%" }} />
      <span className={`${data.primary ? "text-sm" : "text-[11px]"} font-semibold text-zinc-50`}>{data.name}</span>
      <span className="text-[10px] text-zinc-500">
        {data.primary ? `${data.count} SEC filer${data.count === 1 ? "" : "s"}` : "co-sponsor"}
      </span>
    </div>
  );
});

const nodeTypes = { company: CompanyBox, sponsor: SponsorBox };

/** Node diameter by total debt, on a square-root scale so a $20B borrower does not swallow the rest. */
function sizeFor(debt: number | null, max: number): number {
  if (!debt || max <= 0) return 40;
  return Math.round(40 + 52 * Math.sqrt(debt / max));
}

function buildGraph(map: ContagionMap, sponsorId: string, selected: string | null, byCik: Map<string, { c: ContagionCompany; a: ContagionAssessment }>) {
  const members = map.companies.filter((c) => c.sponsors.some((s) => s.sponsorId === sponsorId));
  const order = [...members].sort((x, y) => (x.events.length ? 0 : 1) - (y.events.length ? 0 : 1) || x.name.localeCompare(y.name));
  const maxDebt = Math.max(0, ...members.map((c) => c.debt?.value ?? 0));
  const radius = Math.max(240, order.length * 30);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const sponsor = map.sponsors.find((s) => s.id === sponsorId);
  nodes.push({ id: `sp:${sponsorId}`, type: "sponsor", position: { x: -60, y: -24 }, data: { name: sponsor?.name ?? sponsorId, count: members.length, primary: true }, draggable: false });
  const angleOf = new Map<string, number>();
  order.forEach((c, i) => {
    const angle = (i / order.length) * Math.PI * 2 - Math.PI / 2;
    angleOf.set(c.cik, angle);
    const entry = byCik.get(c.cik);
    if (!entry) return;
    const size = sizeFor(c.debt?.value ?? null, maxDebt);
    nodes.push({
      id: c.cik,
      type: "company",
      position: { x: Math.cos(angle) * radius - 75, y: Math.sin(angle) * radius - size / 2 },
      data: { company: c, assessment: entry.a, size, selected: selected === c.cik },
    });
    const flagged = entry.a.flag === "target" || entry.a.flag === "watch";
    edges.push({ id: `e:${sponsorId}:${c.cik}`, source: `sp:${sponsorId}`, target: c.cik, style: { stroke: flagged ? FLAG_STYLE[entry.a.flag].fill : "rgb(var(--zinc-600))", strokeWidth: flagged ? 1.6 : 1 } });
  });
  // Co-sponsors sit on an outer ring beside the companies they share.
  const others = new Map<string, string[]>();
  for (const c of members) for (const s of c.sponsors) if (s.sponsorId !== sponsorId) others.set(s.sponsorId, [...(others.get(s.sponsorId) ?? []), c.cik]);
  for (const [id, ciks] of others) {
    const angle = ciks.reduce((n, k) => n + (angleOf.get(k) ?? 0), 0) / ciks.length + 0.12;
    nodes.push({ id: `sp:${id}`, type: "sponsor", position: { x: Math.cos(angle) * (radius + 170) - 50, y: Math.sin(angle) * (radius + 170) - 18 }, data: { name: map.sponsors.find((s) => s.id === id)?.name ?? id, count: 0, primary: false }, draggable: false });
    for (const k of ciks) edges.push({ id: `e:${id}:${k}`, source: `sp:${id}`, target: k, style: { stroke: "rgb(var(--zinc-700))", strokeWidth: 1, strokeDasharray: "2 3" } });
  }
  const inView = new Set(members.map((c) => c.cik));
  for (const e of map.edges) {
    if (e.kind !== "lender" || !inView.has(e.source) || !inView.has(e.target)) continue;
    edges.push({ id: e.id, source: e.source, target: e.target, type: "straight", label: e.label, labelStyle: { fontSize: 9, fill: "rgb(var(--zinc-400))" }, labelBgStyle: { fill: "rgb(var(--zinc-950))" }, style: { stroke: "rgb(var(--zinc-500))", strokeDasharray: "6 4", strokeWidth: 1 } });
  }
  return { nodes, edges };
}

function Canvas({ nodes, edges, onPick }: { nodes: Node[]; edges: Edge[]; onPick: (cik: string) => void }) {
  const { fitView } = useReactFlow();
  const first = nodes[0]?.id;
  useEffect(() => {
    const t = setTimeout(() => void fitView({ padding: 0.1, duration: 300 }), 30);
    return () => clearTimeout(t);
  }, [first, nodes.length, fitView]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.15}
      maxZoom={1.6}
      nodesConnectable={false}
      onNodeClick={(_, n) => n.type === "company" && onPick(n.id)}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgb(var(--zinc-800))" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

const RANK: Record<ContagionFlag, number> = { target: 0, watch: 1, clear: 2, history: 3 };

export function ContagionView({ map, initial = null }: { map: ContagionMap; initial?: string | null }) {
  const byCik = useMemo(() => {
    const m = new Map<string, { c: ContagionCompany; a: ContagionAssessment }>();
    for (const c of map.companies) {
      const a = map.assessments.find((x) => x.cik === c.cik);
      if (a) m.set(c.cik, { c, a });
    }
    return m;
  }, [map]);

  // Start on the sponsor with the most flagged companies.
  const sponsorsRanked = useMemo(() => {
    const flagged = (id: string) => map.companies.filter((c) => c.sponsors.some((s) => s.sponsorId === id) && ["target", "watch"].includes(byCik.get(c.cik)?.a.flag ?? "")).length;
    return [...map.sponsors].map((s) => ({ ...s, flagged: flagged(s.id) })).sort((a, b) => b.flagged - a.flagged || b.events - a.events || b.companies - a.companies);
  }, [map, byCik]);
  // A shared link opens on one company: /contagion?company=<CIK>.
  const start = initial ? byCik.get(String(Number(initial))) : undefined;
  const [sponsorId, setSponsorId] = useState(start?.c.sponsors[0].sponsorId ?? sponsorsRanked[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(start?.c.cik ?? null);

  const graph = useMemo(() => buildGraph(map, sponsorId, selected, byCik), [map, sponsorId, selected, byCik]);
  const pick = useCallback((cik: string) => setSelected(cik), []);

  const flaggedAll = useMemo(
    () =>
      map.assessments
        .filter((a) => a.flag === "target" || a.flag === "watch")
        .sort((x, y) => RANK[x.flag] - RANK[y.flag] || y.rules.filter((r) => r.fired).length - x.rules.filter((r) => r.fired).length),
    [map],
  );
  const count = (f: ContagionFlag) => map.assessments.filter((a) => a.flag === f).length;
  const events = map.companies.reduce((n, c) => n + c.events.length, 0);
  const current = selected ? byCik.get(selected) : null;

  return (
    <>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Sponsor-backed SEC filers", String(map.companies.length), `${map.sponsors.length} sponsors, from the "Sponsor" definition in each company's credit documents`],
          ["Events on EDGAR", String(events), "Chapter 11 filings and liability management deals in the companies' 8-Ks"],
          ["Likely next targets", String(count("target")), "All four rules fired"],
          ["Watch", String(count("watch")), "A sibling's event plus at least one more rule, or three rules"],
        ].map(([label, value, sub]) => (
          <div key={label} className="surface rounded-xs border border-zinc-800 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-50">{value}</p>
            <p className="mt-1 text-xs leading-snug text-zinc-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Sponsor">
        {sponsorsRanked.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sponsorId}
            onClick={() => {
              setSponsorId(s.id);
              setSelected(null);
            }}
            className={`rounded-xs border px-2.5 py-1 text-xs ${s.id === sponsorId ? "border-zinc-400 bg-zinc-800 text-zinc-50" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
          >
            {s.name} <span className="font-mono text-zinc-500">{s.companies}</span>
            {s.flagged ? <span className="ml-1 rounded-xs bg-amber-500/20 px-1 font-mono text-[10px] text-amber-400">{s.flagged}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="surface relative h-[620px] rounded-xs border border-zinc-800">
          <ReactFlowProvider>
            <Canvas nodes={graph.nodes} edges={graph.edges} onPick={pick} />
          </ReactFlowProvider>
          <div className="pointer-events-none absolute bottom-2 right-2 flex flex-wrap gap-3 rounded-xs bg-zinc-950/80 px-2 py-1 text-[10px] text-zinc-400">
            {(["target", "watch", "clear", "history"] as ContagionFlag[]).map((f) => (
              <span key={f} className="flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-full border-2 ${FLAG_STYLE[f].border}`} aria-hidden /> {FLAG_STYLE[f].label}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="w-4 border-t border-dashed border-zinc-500" aria-hidden /> Same agent bank
            </span>
            <span>Size: total debt</span>
          </div>
        </div>
        <ContagionPanel map={map} entry={current ?? null} onPick={(cik) => {
          const c = byCik.get(cik)?.c;
          if (c && !c.sponsors.some((s) => s.sponsorId === sponsorId)) setSponsorId(c.sponsors[0].sponsorId);
          setSelected(cik);
        }} />
      </div>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> Flagged across every sponsor
        </h2>
        {flaggedAll.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Company</th>
                  <th className="py-2 pr-3 font-semibold">Flag</th>
                  <th className="py-2 pr-3 font-semibold">Sponsor</th>
                  <th className="py-2 pr-3 font-semibold">Sibling event</th>
                  <th className="py-2 pr-3 font-semibold">Rules</th>
                  <th className="py-2 font-semibold">Maturity window</th>
                </tr>
              </thead>
              <tbody>
                {flaggedAll.map((a) => {
                  const c = byCik.get(a.cik)?.c as ContagionCompany;
                  return (
                    <tr key={a.cik} className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900" onClick={() => {
                      setSponsorId(c.sponsors[0].sponsorId);
                      setSelected(a.cik);
                    }}>
                      <td className="py-2 pr-3 text-zinc-100">
                        {c.name} {c.ticker ? <span className="font-mono text-zinc-500">{c.ticker}</span> : null}
                      </td>
                      <td className={`py-2 pr-3 font-semibold ${FLAG_STYLE[a.flag].text}`}>{FLAG_STYLE[a.flag].label}</td>
                      <td className="py-2 pr-3 text-zinc-300">{c.sponsors.map((s) => map.sponsors.find((x) => x.id === s.sponsorId)?.name).join(", ")}</td>
                      <td className="py-2 pr-3 text-zinc-300">{a.trigger ? `${a.trigger.name}, ${a.trigger.event.date.slice(0, 7)}` : "None"}</td>
                      <td className="py-2 pr-3 font-mono text-zinc-300">{a.rules.filter((r) => r.fired).length} of 4</td>
                      <td className="py-2 text-zinc-300">{a.window ? `Before ${a.window.slice(0, 7)}` : "None"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">No live company meets the rules today.</p>
        )}
      </section>

      <HowItWorks map={map} />
    </>
  );
}

function HowItWorks({ map }: { map: ContagionMap }) {
  return (
    <section className="mt-12 max-w-3xl">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> How this works
      </h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-400">
        <li>
          <span className="text-zinc-200">Who owns whom.</span> EDGAR full-text search finds credit agreements and indentures whose definitions name a sponsor (&ldquo;Sponsor&rdquo; means
          Leonard Green &amp; Partners, L.P. ...). Code cuts out the definition and resolves the names to one sponsor (exact alias, or Jaro-Winkler 0.93 or better). Blank-check
          companies and the sponsors&apos; own funds are dropped.
        </li>
        <li>
          <span className="text-zinc-200">What happened.</span> Each company&apos;s 8-Ks are searched for Item 1.03 bankruptcy filings and the language of liability management
          deals: transaction support agreements, uptiers, drop-downs, non-pro rata exchanges, IPCo transfers. Each event keeps the sentence it was found in.
        </li>
        <li>
          <span className="text-zinc-200">The graph.</span> Companies link to their sponsors, and to each other when the same bank agents their credit agreements. A breadth-first search
          walks two steps out from every company with an event.
        </li>
        <li>
          <span className="text-zinc-200">Four rules, no weights.</span> (1) A sibling under the same sponsor had an event in the last ten years. (2) The trapdoor check found a J.Crew,
          Chewy or Serta door open in the company&apos;s own credit documents. (3) At least 10% of its debt is due within two years of the balance sheet. (4) The bankruptcy model puts it
          at elevated or worse. All four make a likely next target; a sibling&apos;s event plus one more, or any three, make Watch.
        </li>
        <li>
          <span className="text-zinc-200">The warning.</span> Gemini writes three sentences from the graph&apos;s facts, citing the ones it uses. Code strikes a sentence that cites a fact
          that does not exist or uses a figure that is not in what it cites.
        </li>
      </ol>
      <p className="mt-4 text-[12px] leading-relaxed text-zinc-500">
        {map.note} The rules are a screen built on documented sponsor behaviour, not a fitted probability: there are too few public liability management deals per sponsor to
        calibrate one. Built {map.builtAt.slice(0, 10)}.
      </p>
    </section>
  );
}
