"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { useEffect } from "react";
import type { ComponentKey, SignalEvent } from "@/types";
import { COMPONENT_BY_KEY } from "@/lib/components";
import { formatDate } from "@/lib/dates";
import { CATEGORY_STYLES } from "@/lib/event-style";

interface SourceDrawerProps {
  open: boolean;
  component: ComponentKey | null;
  date: string | null;
  events: SignalEvent[];
  onClose: () => void;
}

function impactLabel(impact: number): string {
  if (impact === 0) return "context";
  return `${impact > 0 ? "+" : ""}${impact} pts`;
}

function SourceCard({ event }: { event: SignalEvent }) {
  const style = CATEGORY_STYLES[event.category];
  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-2 text-zinc-400">
          <span className={`h-2 w-2 rounded-full ${style.swatch}`} aria-hidden />
          {style.label}
        </span>
        <span className="font-mono text-zinc-500">{impactLabel(event.score_impact)}</span>
      </div>
      <h3 className="mt-3 text-sm font-medium text-zinc-100">{event.title}</h3>
      {event.quote_kind === "verbatim" ? (
        <blockquote className="mt-3 text-sm leading-relaxed text-zinc-200">
          <mark className="rounded-xs bg-yellow-300/20 px-0.5 text-yellow-50 [box-decoration-break:clone]">
            {event.quote}
          </mark>
        </blockquote>
      ) : (
        <p className="mt-3 border-l-2 border-zinc-700 pl-3 font-mono text-xs leading-relaxed text-zinc-300">
          {event.quote}
        </p>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        {event.quote_kind === "verbatim" ? "Quoted from " : "Reported in "}
        {event.source_label}
      </p>
      <a
        href={event.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-50 hover:decoration-zinc-400"
      >
        Open source
        <ExternalLink className="h-4 w-4 text-zinc-500" aria-hidden />
      </a>
    </article>
  );
}

export function SourceDrawer({ open, component, date, events, onClose }: SourceDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const definition = component ? COMPONENT_BY_KEY[component] : null;

  return (
    <AnimatePresence>
      {open && definition ? (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-zinc-950/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-heading"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-800 bg-zinc-950"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-6 py-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Sources</p>
                <h2 id="drawer-heading" className="mt-1 font-display text-xl font-bold tracking-tight text-zinc-50">
                  {definition.label}
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  {date ? `What drove this component on ${formatDate(date)}.` : definition.description}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                aria-label="Close sources"
                autoFocus
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {events.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  Nothing contributed to this component on this date. {definition.description}
                </p>
              ) : (
                events.map((event) => <SourceCard key={event.id} event={event} />)
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
