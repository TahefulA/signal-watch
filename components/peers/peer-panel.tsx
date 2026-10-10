"use client";

import { type FormEvent, useState } from "react";
import type { Entity, PeerComparison, Report } from "@/types";
import { Button } from "@/components/ui/button";
import { CitationBlock } from "@/components/ui/citation";
import { PeerMap } from "./peer-map";

interface PeerPanelProps {
  subject: Report;
  comparison: PeerComparison | null;
  peers: Report[];
  busy: boolean;
  step: string | null;
  error: string | null;
  onCompare: (tickers: string[]) => void;
  onSelectEntity: (id: string) => void;
  onSelectPeerEntity: (entity: Entity) => void;
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">{children}</h3>;
}

export function PeerPanel({ subject, comparison, peers, busy, step, error, onCompare, onSelectEntity, onSelectPeerEntity }: PeerPanelProps) {
  const [input, setInput] = useState("");
  const ticker = subject.graph.company.ticker;

  function submit(event: FormEvent) {
    event.preventDefault();
    const tickers = Array.from(new Set(input.toUpperCase().split(/[\s,]+/).filter((t) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t) && t !== ticker))).slice(0, 3);
    if (tickers.length > 0) onCompare(tickers);
  }

  const nameOf = (t: string, id: string) =>
    (t === ticker ? subject : peers.find((p) => p.graph.company.ticker === t))?.graph.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <section aria-labelledby="peers-title" className="border-t border-zinc-800 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="peers-title" className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Peer comparison
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {comparison
              ? `${comparison.companies.map((c) => c.ticker).join(" vs ")}, built only from each company's filings and market data.`
              : "Compare with up to three peers. Each peer is analyzed the same way, then matched entity by entity."}
          </p>
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="peer-input" className="sr-only">
            Peer tickers
          </label>
          <input
            id="peer-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. CIFR, IREN"
            disabled={busy}
            className="w-48 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm uppercase text-zinc-100 placeholder:normal-case placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <Button type="submit" disabled={busy || input.trim().length === 0}>
            Compare
          </Button>
        </form>
      </div>
      {busy ? <p className="mt-3 text-sm text-zinc-400">{step ?? "Working..."}</p> : null}
      {error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {comparison && peers[0] ? (
        <div className="mt-6 space-y-8">
          <div className="h-[60vh] min-h-[420px] border border-zinc-800">
            <PeerMap subject={subject} peer={peers[0]} comparison={comparison} onSelect={(e) => (subject.graph.nodes.some((n) => n.id === e.id) ? onSelectEntity(e.id) : onSelectPeerEntity(e))} />
          </div>
          <p className="-mt-6 text-[11px] text-zinc-500">
            {comparison.companies[0]?.ticker} on the left, {peers[0].graph.company.ticker} on the right, shared entities in the middle. A dashed line
            means the entity is named in that company&rsquo;s filings but was not on its map.
          </p>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
            <div>
              <Heading>Shared entities</Heading>
              {comparison.shared.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No entity or risk theme appears for both companies.</p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-800">
                  {comparison.shared.map((s) => (
                    <li key={`${s.kind}-${s.label}`} className="py-3">
                      <p className="text-sm text-zinc-100">
                        {s.label}
                        {s.kind === "theme" ? <span className="ml-2 text-xs text-zinc-500">Similar risk disclosure</span> : null}
                      </p>
                      <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
                        {s.members.map((m) => (
                          <li key={`${m.ticker}-${m.entityId}-${m.name}`}>
                            <span className="font-mono text-zinc-300">{m.ticker}</span> {m.mapped ? `${m.name}: ${m.relationship}` : "Named in its filings, not on its map"}
                          </li>
                        ))}
                      </ul>
                      <details className="mt-1">
                        <summary className="cursor-pointer list-none text-[11px] text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200">
                          Evidence
                        </summary>
                        {s.members.map((m) => (
                          <div key={`${m.ticker}-q`}>
                            <p className="mt-2 font-mono text-[10px] text-zinc-400">{m.ticker}</p>
                            <CitationBlock citation={m.citation} compact />
                          </div>
                        ))}
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-8">
              <div>
                <Heading>Divergence signals</Heading>
                {comparison.divergences.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">No rule-based divergence between these companies.</p>
                ) : (
                  <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-zinc-300">
                    {comparison.divergences.map((d) => (
                      <li key={d.text}>{d.text}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <Heading>Unique entities</Heading>
                <dl className="mt-3 space-y-3 text-sm">
                  {comparison.companies.map((c) => (
                    <div key={c.ticker}>
                      <dt className="font-mono text-xs text-zinc-400">{c.ticker} only</dt>
                      <dd className="mt-1 text-zinc-300">
                        {(comparison.unique[c.ticker] ?? []).map((id) => nameOf(c.ticker, id)).join(", ") || "None"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Named counterparties are listed as unique only after the other company&rsquo;s filings were searched for them.
                </p>
              </div>
            </div>
          </div>

          <div>
            <Heading>Comparative metrics</Heading>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Metric</th>
                    {comparison.companies.map((c) => (
                      <th key={c.ticker} className="py-2 pr-4 font-mono font-medium text-zinc-300">
                        {c.ticker}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.metrics.map((row) => (
                    <tr key={row.label} className="border-b border-zinc-800/60">
                      <td className="py-2 pr-4 text-zinc-400">{row.label}</td>
                      {row.values.map((v) => (
                        <td key={v.ticker} className="py-2 pr-4 font-mono text-zinc-100" title={v.note}>
                          {v.display}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">Hover a figure for how it was built. Each company&rsquo;s capital structure panel cites its sources.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
