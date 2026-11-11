"use client";

import { Background, BackgroundVariant, Controls, type Edge, Handle, type Node, type NodeProps, Position, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { ArrowRight, Network } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContagionAssessment, ContagionCompany, ContagionFlag, ContagionMap } from "@/types";
import { ContagionPanel } from "./contagion-panel";
import { FLAG_STYLE, KIND_PLAIN, KIND_SHORT, month, signals } from "./language";
import { PlaybookTimeline, TimelineLegend, type TimelineRow } from "./playbook-timeline";
import { SignalPips } from "./signal-gauge";
import { compactMoney } from "@/lib/node-visuals";

export { FLAG_STYLE };

const EVENT_TEXT = KIND_SHORT;

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
    <div className="relative flex flex-col items-center" style={{ width: 150, opacity: a.flag === "history" && !selected ? 0.45 : 1 }}>
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
  const lit = selected ? byCik.get(selected)?.a.trigger : null;
  const path = new Set(selected && lit?.degrees === 1 ? [selected, lit.cik] : []);
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
    const onPath = path.has(c.cik);
    edges.push({
      id: `e:${sponsorId}:${c.cik}`,
      source: `sp:${sponsorId}`,
      target: c.cik,
      animated: onPath,
      style: { stroke: onPath ? "#ef4444" : flagged ? FLAG_STYLE[entry.a.flag].fill : "rgb(var(--zinc-600))", strokeWidth: onPath ? 2.5 : flagged ? 1.6 : 1, opacity: path.size && !onPath ? 0.35 : 1 },
    });
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
const CARDS = 6;

function Section({ title, sub, children, id, action }: { title: string; sub?: string; children: React.ReactNode; id?: string; action?: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> {title}
          </h2>
          {sub ? <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-zinc-400">{sub}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ContagionView({ map, initial = null }: { map: ContagionMap; initial?: string | null }) {
  const byCik = useMemo(() => {
    const m = new Map<string, { c: ContagionCompany; a: ContagionAssessment }>();
    for (const c of map.companies) {
      const a = map.assessments.find((x) => x.cik === c.cik);
      if (a) m.set(c.cik, { c, a });
    }
    return m;
  }, [map]);
  const today = map.builtAt.slice(0, 10);

  const sponsorStats = useMemo(
    () =>
      map.sponsors
        .map((s) => {
          const members = map.companies.filter((c) => c.sponsors.some((l) => l.sponsorId === s.id));
          const events = members.flatMap((c) => c.events.map((e) => ({ c, e })));
          return {
            ...s,
            members,
            events,
            live: members.filter((c) => c.active).length,
            squeezes: events.filter((x) => x.e.kind !== "bankruptcy").length,
            bankruptcies: events.filter((x) => x.e.kind === "bankruptcy").length,
            flagged: members.filter((c) => ["target", "watch"].includes(byCik.get(c.cik)?.a.flag ?? "")).length,
            last: events.sort((x, y) => y.e.date.localeCompare(x.e.date))[0] ?? null,
          };
        })
        .sort((a, b) => b.flagged - a.flagged || b.events.length - a.events.length || b.members.length - a.members.length),
    [map, byCik],
  );

  /** The company the network opens on for an owner: its most flagged live company, so the panel is never empty. */
  const lead = useCallback(
    (id: string) =>
      map.assessments
        .filter((a) => byCik.get(a.cik)?.c.sponsors.some((s) => s.sponsorId === id))
        .sort((x, y) => RANK[x.flag] - RANK[y.flag] || y.rules.filter((r) => r.fired).length - x.rules.filter((r) => r.fired).length)[0]?.cik ?? null,
    [map, byCik],
  );
  // A shared link opens on one company: /contagion?company=<CIK>.
  const start = initial ? byCik.get(String(Number(initial))) : undefined;
  const [sponsorId, setSponsorId] = useState(start?.c.sponsors[0].sponsorId ?? sponsorStats[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(start?.c.cik ?? lead(sponsorStats[0]?.id ?? ""));
  const [allCards, setAllCards] = useState(false);
  const network = useRef<HTMLDivElement>(null);

  const graph = useMemo(() => buildGraph(map, sponsorId, selected, byCik), [map, sponsorId, selected, byCik]);
  const pick = useCallback((cik: string) => setSelected(cik), []);
  const show = useCallback(
    (cik: string | null, sponsor?: string, scroll = true) => {
      const c = cik ? byCik.get(cik)?.c : null;
      const next = sponsor ?? (c && !c.sponsors.some((s) => s.sponsorId === sponsorId) ? c.sponsors[0].sponsorId : sponsorId);
      setSponsorId(next);
      setSelected(cik ?? lead(next));
      if (scroll) network.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [byCik, sponsorId, lead],
  );
  useEffect(() => {
    if (start) network.current?.scrollIntoView({ block: "start" });
    // Only on arrival from a shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flagged = useMemo(
    () =>
      map.assessments
        .filter((a) => a.flag === "target" || a.flag === "watch")
        .sort((x, y) => RANK[x.flag] - RANK[y.flag] || y.rules.filter((r) => r.fired).length - x.rules.filter((r) => r.fired).length || (y.trigger?.event.date ?? "").localeCompare(x.trigger?.event.date ?? "")),
    [map],
  );
  const count = (f: ContagionFlag) => map.assessments.filter((a) => a.flag === f).length;
  const events = map.companies.reduce((n, c) => n + c.events.length, 0);
  const current = selected ? byCik.get(selected) : null;
  const repeaters = sponsorStats.filter((s) => s.events.length >= 2).length;

  const rows: TimelineRow[] = sponsorStats
    .filter((s) => s.events.length || s.flagged)
    .map((s) => ({
      id: s.id,
      label: s.name,
      sub: `${s.members.length} companies · ${s.live} still filing`,
      marks: s.events.map(({ c, e }) => ({ id: e.id, date: e.date, kind: e.kind, title: `${c.name}: ${KIND_SHORT[e.kind]}`, quote: e.quote, url: e.url })),
      highlight: s.id === sponsorId,
      tag: s.flagged ? { text: `${s.flagged} on watch`, tone: "amber" as const } : undefined,
    }));

  return (
    <>
      <p className="mt-6 max-w-3xl font-display text-[19px] leading-snug text-zinc-100">
        {count("target")
          ? `${count("target")} borrower${count("target") === 1 ? " has" : "s have"} every warning sign on. `
          : "No borrower has every warning sign on today. "}
        <span className="text-amber-400">{count("watch")} are on watch</span>: their owner has squeezed lenders or let a company go bankrupt before, and at least one more sign is on.
      </p>
      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-y border-zinc-800 py-3">
        {[
          [String(map.companies.length), "sponsor-backed SEC filers"],
          [String(map.sponsors.length), "private equity owners"],
          [String(events), "bankruptcies and squeezes on EDGAR"],
          [String(repeaters), "owners that have done it more than once"],
        ].map(([v, l]) => (
          <div key={l} className="flex items-baseline gap-2">
            <dt className="order-2 text-xs text-zinc-500">{l}</dt>
            <dd className="font-mono text-xl font-semibold text-zinc-50">{v}</dd>
          </div>
        ))}
      </dl>

      <Section
        title="The playbook repeats"
        sub="Every bankruptcy and lender squeeze in each owner's public portfolio, by year. Rows that light up again and again are owners that have done this more than once; the tag on the right is how many of their live companies could be next."
      >
        <div className="surface rounded-xs border border-zinc-800 p-3">
          <PlaybookTimeline rows={rows} today={today} onRow={(id) => show(null, id)} labelWidth={170} />
          <div className="mt-3 border-t border-zinc-800 pt-2">
            <TimelineLegend />
          </div>
        </div>
      </Section>

      <Section
        title={`On watch · ${flagged.length}`}
        sub="Live borrowers whose owner has done it before, ranked by how many warning signs are on. Willing: the owner squeezed lenders or let a company fail before. Able: a loophole is open in the loan documents. Needs to: debt coming due or a weak balance sheet."
        action={
          flagged.length > CARDS && !allCards ? (
            <button type="button" onClick={() => setAllCards(true)} className="text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100">
              Show all {flagged.length}
            </button>
          ) : null
        }
      >
        {flagged.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(allCards ? flagged : flagged.slice(0, CARDS)).map((a) => {
              const c = byCik.get(a.cik)?.c as ContagionCompany;
              const sig = signals(c, a);
              const owner = c.sponsors.map((s) => map.sponsors.find((x) => x.id === s.sponsorId)?.name).join(" & ");
              return (
                <article key={a.cik} className={`surface flex flex-col rounded-xs border p-4 ${a.flag === "target" ? "border-red-700" : "border-zinc-800"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold text-zinc-50">{c.name}</h3>
                      <p className="text-[11px] text-zinc-500">
                        {c.ticker ? <span className="font-mono">{c.ticker} · </span> : null}
                        {owner}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider ${FLAG_STYLE[a.flag].text}`}>{FLAG_STYLE[a.flag].label}</span>
                  </div>
                  {a.trigger ? (
                    <p className="mt-3 text-[12.5px] leading-snug text-zinc-300">
                      Sister company <span className="text-zinc-100">{a.trigger.name}</span> had a {KIND_PLAIN[a.trigger.event.kind]} in {month(a.trigger.event.date)}.
                    </p>
                  ) : null}
                  {a.window ? <p className="mt-1 text-[12px] text-zinc-400">Debt coming due before {month(a.window)}.</p> : null}
                  <div className="mt-auto pt-4">
                    <SignalPips items={sig} />
                    <div className="mt-3 flex gap-3 text-xs">
                      {c.ticker && c.active ? (
                        <a href={`/company?ticker=${c.ticker}&tab=owner`} className="inline-flex items-center gap-1 text-zinc-200 hover:text-zinc-50">
                          Full report <ArrowRight className="h-3 w-3" aria-hidden />
                        </a>
                      ) : null}
                      <button type="button" onClick={() => show(a.cik)} className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100">
                        <Network className="h-3 w-3" aria-hidden /> In the network
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No live company meets the rules today.</p>
        )}
      </Section>

      <Section title="Owner scorecard" sub="Each owner's public portfolio and what has happened in it since 2016. Click a row to open its network.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">Owner</th>
                <th className="py-2 pr-3 text-right font-semibold">Companies</th>
                <th className="py-2 pr-3 text-right font-semibold">Still filing</th>
                <th className="py-2 pr-3 text-right font-semibold" title="Lender squeezes and restructuring deals with lenders">Squeezes</th>
                <th className="py-2 pr-3 text-right font-semibold">Bankruptcies</th>
                <th className="py-2 pr-3 font-semibold">Most recent</th>
                <th className="py-2 text-right font-semibold">On watch</th>
              </tr>
            </thead>
            <tbody>
              {sponsorStats.map((s) => (
                <tr key={s.id} className={`cursor-pointer border-t border-zinc-800 hover:bg-zinc-900 ${s.id === sponsorId ? "bg-zinc-900" : ""}`} onClick={() => show(null, s.id)}>
                  <td className="py-2 pr-3 font-medium text-zinc-100">{s.name}</td>
                  <td className="py-2 pr-3 text-right font-mono text-zinc-300">{s.members.length}</td>
                  <td className="py-2 pr-3 text-right font-mono text-zinc-300">{s.live}</td>
                  <td className={`py-2 pr-3 text-right font-mono ${s.squeezes ? "text-red-400" : "text-zinc-600"}`}>{s.squeezes}</td>
                  <td className={`py-2 pr-3 text-right font-mono ${s.bankruptcies ? "text-zinc-200" : "text-zinc-600"}`}>{s.bankruptcies}</td>
                  <td className="py-2 pr-3 text-zinc-400">{s.last ? `${s.last.c.name}, ${month(s.last.e.date)}` : "None"}</td>
                  <td className={`py-2 text-right font-mono ${s.flagged ? "text-amber-400" : "text-zinc-600"}`}>{s.flagged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div ref={network} className="scroll-mt-6">
        <Section title="Explore the network" sub="One owner at a time: its companies in a ring, sized by debt. Click a company to see the path from its sister company's event and the evidence behind each warning sign.">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sponsor">
            {sponsorStats.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === sponsorId}
                onClick={() => show(null, s.id, false)}
                className={`rounded-xs border px-2.5 py-1 text-xs ${s.id === sponsorId ? "border-zinc-400 bg-zinc-800 text-zinc-50" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
              >
                {s.name} <span className="font-mono text-zinc-500">{s.members.length}</span>
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
                  <span className="w-4 border-t border-dashed border-zinc-500" aria-hidden /> Same lending bank
                </span>
                <span>Size: total debt</span>
              </div>
            </div>
            <ContagionPanel map={map} entry={current ?? null} onPick={(cik) => show(cik, undefined, false)} />
          </div>
        </Section>
      </div>

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
          deals, the &ldquo;lender squeezes&rdquo; of this page: transaction support agreements, uptiers, drop-downs, IPCo transfers. Each event keeps the sentence it was found in.
        </li>
        <li>
          <span className="text-zinc-200">The graph.</span> Companies link to their sponsors, and to each other when the same bank agents their credit agreements. A breadth-first search
          walks two steps out from every company with an event.
        </li>
        <li>
          <span className="text-zinc-200">Four rules, no weights, three questions.</span> Willing: (1) a sister company under the same owner had an event in the last ten years. Able: (2) the
          loophole check found a J.Crew, Chewy or Serta door open in the company&apos;s own loan documents. Needs to: (3) At least 10% of its debt is due within two years of the balance sheet. (4) The bankruptcy model puts it
          at elevated or worse. All four make a likely next target; a sibling&apos;s event plus one more, or any three, make Watch.
        </li>
        <li>
          <span className="text-zinc-200">The warning.</span> Gemini writes three sentences from the graph&apos;s facts, citing the ones it uses. Code strikes a sentence that cites a fact
          that does not exist or uses a figure that is not in what it cites.
        </li>
      </ol>
      <p className="mt-4 text-[12px] leading-relaxed text-zinc-500">
        {map.note} The rules are a screen built on documented sponsor behaviour, not a fitted probability: there are too few public liability management deals per sponsor to
        calibrate one. Built {map.builtAt.slice(0, 10)}.{" "}
        <a href="/proof#contagion" className="text-zinc-300 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-50">
          See how the screen did on past years
        </a>
        .
      </p>
    </section>
  );
}
