"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Entity } from "@/types";
import type { EntityLink } from "@/lib/graph-view";
import { SEVERITY_LABELS, SEVERITY_STRIP, TYPE_BORDER, TYPE_LABELS } from "@/lib/entity-style";
import { Button } from "@/components/ui/button";

interface EntityPanelProps {
  entity: Entity | null;
  companyName: string;
  links: EntityLink[];
  nodes: Entity[];
  onSelectEntity: (id: string) => void;
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

export function EntityPanel({ entity, companyName, links, nodes, onSelectEntity, onClose, onToast }: EntityPanelProps) {
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
    try {
      await navigator.clipboard.writeText(`"${entity.sourceQuote}" (${entity.sourceType}, ${entity.sourceDate}, ${entity.sourceUrl})`);
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
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-zinc-800 bg-zinc-900"
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
              <span className={`mt-2 inline-block rounded-sm border px-1.5 py-0.5 text-[11px] text-zinc-300 ${TYPE_BORDER[entity.type]}`}>
                {TYPE_LABELS[entity.type]}
              </span>
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

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {entity.isCentral ? null : (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  Relationship to {companyName}
                </h3>
                <p className="mt-2 text-sm text-zinc-200">{entity.relationship}</p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-400">
                  <span className={`h-3.5 w-1 ${SEVERITY_STRIP[entity.severity]}`} aria-hidden />
                  {SEVERITY_LABELS[entity.severity]}
                </p>
              </section>
            )}

            {links.length > 0 ? (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Linked on the map</h3>
                <ul className="mt-2 space-y-1.5">
                  {links.map((link) => {
                    const other = nodes.find((n) => n.id === link.entityId);
                    if (!other) return null;
                    return (
                      <li key={`${link.direction}-${link.entityId}`} className="text-sm text-zinc-300">
                        {link.direction === "out" ? (
                          <>
                            {link.relationship}{" "}
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onSelectEntity(other.id)}
                          className="text-zinc-100 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300"
                        >
                          {other.name}
                        </button>
                        {link.direction === "in" ? <span className="text-zinc-400"> {link.relationship.toLowerCase()} this</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Source</h3>
              <p className="mt-2 font-mono text-xs text-zinc-400">
                {entity.sourceType} · {entity.sourceDate}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{entity.sourceLabel}</p>
              <blockquote className="mt-3 border-l-2 border-zinc-600 pl-3 text-sm italic leading-relaxed text-zinc-300">
                {entity.sourceQuote}
              </blockquote>
              <a
                href={entity.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-50"
              >
                {entity.sourceType === "News" ? "View full article" : "View full filing"}
                <ExternalLink className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
              </a>
            </section>
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
