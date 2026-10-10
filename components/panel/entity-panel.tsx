"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Copy, ExternalLink, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { CapitalStructure, Confidence, Entity, EntityChange, EntityGraph, MagnitudeKind, RelationType, Trend } from "@/types";
import { multiHop } from "@/lib/graph-view";
import type { PeerContext } from "@/lib/peer-view";
import { SEVERITY_LABELS, SEVERITY_STRIP, TYPE_BORDER, TYPE_LABELS } from "@/lib/entity-style";
import { Button } from "@/components/ui/button";
import { CitationBlock, citationLine } from "@/components/ui/citation";

interface EntityPanelProps {
  entity: Entity | null;
  companyName: string;
  graph: EntityGraph | null;
  capital: CapitalStructure | null | undefined;
  peerContext: PeerContext | null;
  onSelectEntity: (id: string) => void;
  onShowCapital: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
}

const WATCHLIST_KEY = "signal-watch:watchlist";

interface WatchlistItem {
  name: string;
  type: string;
  company: string;
  sourceUrl: string;
  addedAt: string;
}

function readWatchlist(): WatchlistItem[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

const RELATION_PLURAL: Record<RelationType, string> = {
  CUSTOMER_OF: "Other customers and tenants",
  SUPPLIES_TO: "Other suppliers",
  LENDS_TO: "Other lenders and debt",
  GUARANTEES: "Other guarantors",
  REGULATES: "Other regulators",
  COMPETES_WITH: "Other competitors",
  OWNED_BY: "Other owned entities",
  PARTNERS_WITH: "Other partners",
  AFFILIATED_WITH: "Other people",
  IMPACTS: "Other risks and factors",
};

const TREND_TEXT: Record<Trend, string> = {
  increasing: "Increasing",
  decreasing: "Decreasing",
  stable: "Stable",
  unknown: "Not disclosed",
};

/** Magnitude rows the spec asks for, plus a row for figures of other kinds. */
const IMPACT_ROWS: { kind: MagnitudeKind; label: string }[] = [
  { kind: "revenue", label: "Revenue impact" },
  { kind: "cost", label: "Cost impact" },
  { kind: "balance_sheet", label: "Balance sheet impact" },
];

const OTHER_KIND_LABEL: Record<MagnitudeKind, string> = {
  revenue: "Revenue impact",
  cost: "Cost impact",
  balance_sheet: "Balance sheet impact",
  contract: "Contract",
  capacity: "Capacity",
  other: "Disclosed figure",
};

const CHANGE_DOT: Record<EntityChange["kind"], string> = {
  new: "bg-emerald-500",
  changed: "bg-amber-500",
  removed: "border border-dashed border-zinc-500",
};

const CHANGE_LABEL: Record<EntityChange["kind"], string> = {
  new: "New since the previous quarter",
  changed: "Changed since the previous quarter",
  removed: "No longer mentioned in the current filings",
};

const CONFIDENCE_MARK: Record<Confidence, string> = {
  high: "bg-emerald-500",
  medium: "border border-emerald-500",
  low: "border border-dashed border-amber-500",
};

const CONFIDENCE_TEXT: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

const NOT_EXTRACTED = "Not extracted for this report. Read the filings again to add context.";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-800 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{children}</dd>
    </div>
  );
}

function Missing({ children = "Not disclosed" }: { children?: ReactNode }) {
  return <span className="text-zinc-500">{children}</span>;
}

function Evidence({ entity }: { entity: Entity }) {
  const [showContext, setShowContext] = useState(false);
  const context = entity.sourceContext && entity.sourceContext !== entity.sourceQuote ? entity.sourceContext : null;
  return (
    <Section title="Evidence">
      <blockquote className="border-l-2 border-zinc-600 pl-3 text-sm italic leading-relaxed text-zinc-300">{entity.sourceQuote}</blockquote>
      <p className="mt-2 font-mono text-[10px] text-zinc-500">
        {citationLine({
          sourceType: entity.fiscalPeriod ? `${entity.sourceType} ${entity.fiscalPeriod}` : entity.sourceType,
          sourceDate: entity.sourceType === "News" ? entity.sourceDate : `filed ${entity.sourceDate}`,
          sourceLabel: entity.sourceLabel,
          page: entity.sourcePage,
        })}
      </p>
      {context ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowContext((v) => !v)}
            className="text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100"
            aria-expanded={showContext}
          >
            {showContext ? "Hide surrounding paragraph" : "Show surrounding paragraph"}
          </button>
          {showContext ? <p className="mt-2 text-xs leading-relaxed text-zinc-400">{context}</p> : null}
        </div>
      ) : null}
      <a
        href={entity.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-50"
      >
        {entity.sourceType === "News" ? "View full article" : "View full filing on SEC EDGAR"}
        <ExternalLink className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
      </a>
    </Section>
  );
}

function MagnitudeSection({ entity }: { entity: Entity }) {
  if (entity.magnitude === undefined) {
    return (
      <Section title="Magnitude">
        <p className="text-sm text-zinc-500">{NOT_EXTRACTED}</p>
      </Section>
    );
  }
  const m = entity.magnitude;
  const otherKind = m && !IMPACT_ROWS.some((r) => r.kind === m.kind) ? m : null;
  return (
    <Section title="Magnitude">
      <dl>
        {IMPACT_ROWS.map((row) => (
          <Row key={row.kind} label={row.label}>
            {m && m.kind === row.kind ? <span className="font-mono">{m.label}</span> : <Missing />}
          </Row>
        ))}
        {otherKind ? (
          <Row label={OTHER_KIND_LABEL[otherKind.kind]}>
            <span className="font-mono">{otherKind.label}</span>
          </Row>
        ) : null}
        <Row label="Trend">
          {entity.trend && entity.trend !== "unknown" ? TREND_TEXT[entity.trend] : <Missing>{entity.trendBasis ?? "Not disclosed"}</Missing>}
          {entity.trend && entity.trend !== "unknown" && entity.trendBasis ? <span className="block text-xs text-zinc-500">{entity.trendBasis}</span> : null}
        </Row>
      </dl>
      {m ? <CitationBlock citation={m.citation} compact /> : null}
      {entity.trendCitation && entity.trendCitation.quote !== m?.citation.quote ? (
        <CitationBlock citation={entity.trendCitation} compact />
      ) : null}
      {!m ? (
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          The filings read for this report give no figure for this entity. Signal Watch shows a number only when the
          filing states it.
        </p>
      ) : null}
    </Section>
  );
}

function StrategicSection({ entity }: { entity: Entity }) {
  const s = entity.strategic;
  if (!s) {
    return (
      <Section title="Strategic context">
        <p className="text-sm text-zinc-500">{NOT_EXTRACTED}</p>
      </Section>
    );
  }
  return (
    <Section title="Strategic context">
      <dl>
        <Row label="Why it matters">{s.whyItMatters ?? <Missing />}</Row>
        <Row label={entity.type === "risk" || entity.type === "macro" || entity.type === "regulatory" ? "If it materializes" : "If it disappeared"}>
          {s.ifItDisappeared ?? <Missing />}
        </Row>
        <Row label="Structural protection">{s.protection ? s.protection.text : <Missing />}</Row>
      </dl>
      {s.protection ? <CitationBlock citation={s.protection.citation} compact /> : null}
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        The first two rows are Gemini&rsquo;s reading of the filings, not quotations. Protection is shown only with the
        sentence that describes it.
      </p>
    </Section>
  );
}

function ComparisonSection({ context }: { context: PeerContext | null }) {
  if (context) {
    return (
      <Section title="Comparison">
        <dl>
          <Row label="Peer exposure">{context.exposure}</Row>
          <Row label="Sector norm">{context.norm}</Row>
          <Row label="Differentiation">{context.differentiation}</Row>
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">From the loaded peers&rsquo; reports and filings only. A few peers are not a full sector.</p>
      </Section>
    );
  }
  return (
    <Section title="Comparison">
      <dl>
        <Row label="Peer exposure">
          <Missing>No peer comparison loaded</Missing>
        </Row>
        <Row label="Sector norm">
          <Missing>No peer comparison loaded</Missing>
        </Row>
        <Row label="Differentiation">
          <Missing>No peer comparison loaded</Missing>
        </Row>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        Use Peer comparison below the memo. Comparison comes from other companies&rsquo; filings, never from general knowledge.
      </p>
    </Section>
  );
}

function RelatedSection({
  entity,
  graph,
  onSelectEntity,
}: {
  entity: Entity;
  graph: EntityGraph | null;
  onSelectEntity: (id: string) => void;
}) {
  if (!graph) return null;
  const nodes = graph.nodes;
  const hop = multiHop(graph, entity.id);
  const byId = (id: string) => nodes.find((n) => n.id === id);
  const siblings = entity.relationType
    ? nodes.filter((n) => !n.isCentral && n.id !== entity.id && n.relationType === entity.relationType && n.change?.kind !== "removed")
    : [];
  const linkButton = (other: Entity) => (
    <button
      type="button"
      onClick={() => onSelectEntity(other.id)}
      className="text-zinc-100 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300"
    >
      {other.name}
    </button>
  );
  return (
    <Section title="Connections">
      <p className="text-xs text-zinc-500">Direct</p>
      <ul className="mt-1.5 space-y-1.5">
        {hop.direct.map((link) => {
          const other = byId(link.entityId);
          if (!other) return null;
          return (
            <li key={`${link.direction}-${link.entityId}`} className="text-sm text-zinc-300">
              {other.isCentral ? (
                <span className="text-zinc-100">{other.name}</span>
              ) : (
                linkButton(other)
              )}
              <span className="text-zinc-500">
                {" "}
                · {other.isCentral ? (entity.relationDetail ?? entity.relationType ?? link.relationship).replace(/_/g, " ").toLowerCase() : link.relationship.toLowerCase()}
              </span>
            </li>
          );
        })}
        {entity.parent ? (
          <li className="text-sm text-zinc-300">
            <span className="text-zinc-100">{entity.parent.name}</span>
            <span className="text-zinc-500"> · parent, per the filing</span>
          </li>
        ) : null}
      </ul>

      {hop.via.map((group) => {
        const through = byId(group.throughId);
        if (!through) return null;
        return (
          <div key={group.throughId} className="mt-4">
            <p className="text-xs text-zinc-500">Related via {through.name}</p>
            <ul className="mt-1.5 space-y-2">
              {group.links.map((link) => {
                const other = byId(link.entityId);
                if (!other) return null;
                const [from, to] = link.direction === "out" ? [through, other] : [other, through];
                return (
                  <li key={link.entityId} className="text-sm text-zinc-300">
                    {linkButton(other)}
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {from.name} {link.relationship.toLowerCase()} {to.name}.
                    </p>
                    <p className="mt-0.5 text-xs italic leading-relaxed text-zinc-500">&ldquo;{other.sourceQuote}&rdquo;</p>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {hop.via.length === 0 ? <p className="mt-3 text-xs text-zinc-500">No second-order connection on the map beyond the subject company.</p> : null}

      {siblings.length > 0 && entity.relationType ? (
        <div className="mt-4">
          <p className="text-xs text-zinc-500">{RELATION_PLURAL[entity.relationType]}</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {siblings.map((s) => (
              <li key={s.id}>{linkButton(s)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

function CompanySummary({ capital, onShowCapital }: { capital: CapitalStructure | null | undefined; onShowCapital: () => void }) {
  if (!capital) {
    return (
      <Section title="Capital structure">
        <p className="text-sm text-zinc-500">{capital === undefined ? NOT_EXTRACTED : "No debt note was found in the latest periodic filing."}</p>
      </Section>
    );
  }
  const keys = ["total_debt", "net_debt", "debt_to_ebitda", "interest_coverage", "liquidity"];
  return (
    <Section title="Capital structure">
      <dl>
        {capital.metrics
          .filter((m) => keys.includes(m.key))
          .map((m) => (
            <Row key={m.key} label={m.label}>
              <span className="font-mono">{m.display}</span>
            </Row>
          ))}
      </dl>
      <Button className="mt-3" onClick={onShowCapital}>
        Open capital structure
      </Button>
    </Section>
  );
}

export function EntityPanel({
  entity,
  companyName,
  graph,
  capital,
  peerContext,
  onSelectEntity,
  onShowCapital,
  onClose,
  onToast,
}: EntityPanelProps) {
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    if (!entity) return;
    setWatched(readWatchlist().some((w) => w.name === entity.name && w.company === companyName));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entity, companyName, onClose]);

  async function copyQuote() {
    if (!entity) return;
    const page = entity.sourcePage ? `, p. ${entity.sourcePage}` : "";
    try {
      await navigator.clipboard.writeText(`"${entity.sourceQuote}" (${entity.sourceType}, ${entity.sourceDate}${page}, ${entity.sourceUrl})`);
      onToast("Quote copied");
    } catch {
      onToast("Copy failed. Select the quote and copy it manually.");
    }
  }

  function addToWatchlist() {
    if (!entity || watched) return;
    try {
      const next: WatchlistItem[] = [
        ...readWatchlist(),
        { name: entity.name, type: entity.type, company: companyName, sourceUrl: entity.sourceUrl, addedAt: new Date().toISOString() },
      ];
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      setWatched(true);
      onToast(`${entity.name} added to watchlist`);
    } catch {
      onToast("This browser is blocking local storage, so the watchlist is unavailable.");
    }
  }

  return (
    <AnimatePresence>
      {entity ? (
        <motion.aside
          key={entity.id}
          role="dialog"
          aria-labelledby="entity-panel-title"
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[460px] flex-col border-l border-zinc-800 bg-zinc-900"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-6 py-5">
            <div className="min-w-0">
              <h2 id="entity-panel-title" className="text-lg font-semibold leading-snug text-zinc-100">
                {entity.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-block rounded-xs border px-1.5 py-0.5 text-[11px] text-zinc-300 ${TYPE_BORDER[entity.type]}`}>
                  {TYPE_LABELS[entity.type]}
                </span>
                {entity.change ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className={`h-2 w-2 rounded-full ${CHANGE_DOT[entity.change.kind]}`} aria-hidden />
                    {CHANGE_LABEL[entity.change.kind]}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <Section title="Identity">
              <dl>
                {entity.isCentral ? (
                  <Row label="Ticker">
                    <span className="font-mono">{entity.relationship}</span>
                  </Row>
                ) : (
                  <>
                    <Row label="Relationship">{entity.relationship}</Row>
                    {entity.relationDetail || entity.relationType ? (
                      <Row label="Relationship type">
                        <span className="font-mono text-xs">{(entity.relationDetail ?? entity.relationType ?? "").replace(/_/g, " ")}</span>
                      </Row>
                    ) : null}
                    {entity.headline ? <Row label="Headline">{entity.headline}</Row> : null}
                    {entity.confidence ? (
                      <Row label="Confidence">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-xs ${CONFIDENCE_MARK[entity.confidence]}`} aria-hidden />
                          {CONFIDENCE_TEXT[entity.confidence]}
                        </span>
                        {entity.confidenceBasis ? <span className="block text-xs text-zinc-500">{entity.confidenceBasis}</span> : null}
                      </Row>
                    ) : null}
                    {entity.aliases?.length ? <Row label="Also named">{entity.aliases.join(", ")}</Row> : null}
                    <Row label="Severity">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-3.5 w-1 ${SEVERITY_STRIP[entity.severity]}`} aria-hidden />
                        {SEVERITY_LABELS[entity.severity]}
                      </span>
                    </Row>
                  </>
                )}
              </dl>
              {entity.change && entity.change.details.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {entity.change.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </Section>

            <Evidence entity={entity} />

            {entity.isCentral ? (
              <CompanySummary capital={capital} onShowCapital={onShowCapital} />
            ) : (
              <>
                <MagnitudeSection entity={entity} />
                <StrategicSection entity={entity} />
                <ComparisonSection context={peerContext} />
                <RelatedSection entity={entity} graph={graph} onSelectEntity={onSelectEntity} />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-zinc-800 px-6 py-4">
            <Button onClick={copyQuote}>
              <Copy className="h-4 w-4 text-zinc-500" aria-hidden />
              Copy quote
            </Button>
            <a
              href={entity.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-sm border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
            >
              <ExternalLink className="h-4 w-4 text-zinc-500" aria-hidden />
              Open source
            </a>
            <Button onClick={addToWatchlist} disabled={watched}>
              <Bookmark className="h-4 w-4 text-zinc-500" aria-hidden />
              {watched ? "On watchlist" : "Add to watchlist"}
            </Button>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
