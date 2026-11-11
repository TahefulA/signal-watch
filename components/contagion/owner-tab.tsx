"use client";

import { ExternalLink, Network } from "lucide-react";
import { useEffect, useState } from "react";
import type { OwnerView, Report } from "@/types";
import { TabHeader } from "@/components/tabs/financial-tab";
import { FLAG_STYLE, KIND_PLAIN, KIND_SHORT, month, signals, verdictLine } from "./language";
import { PlaybookTimeline, TimelineLegend, type TimelineRow } from "./playbook-timeline";
import { SignalGauge } from "./signal-gauge";

const views = new Map<string, OwnerView>();
const MAX_ROWS = 12;

/** The borrower read through its owner: the sponsor, its other companies over time, and the three warning signs. */
export function OwnerTab({ report }: { report: Report }) {
  const { cik, ticker } = report.graph.company;
  const [view, setView] = useState<OwnerView | null>(views.get(cik) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (views.has(cik)) return;
    let live = true;
    fetch(`/api/contagion/owner?cik=${cik}&ticker=${encodeURIComponent(ticker)}&report=${report.id}`)
      .then(async (r) => {
        const body = (await r.json()) as OwnerView | { error: string };
        if ("error" in body) throw new Error(body.error);
        views.set(cik, body);
        if (live) setView(body);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [cik, ticker, report.id]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-12">
      <TabHeader title="Owner" />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {!view && !error ? (
        <div className="surface rounded-xs border border-zinc-800 p-5">
          <p className="text-sm text-zinc-200">Reading {ticker}&apos;s credit agreements for a private equity owner...</p>
          <p className="mt-1 text-xs text-zinc-500">The first look at a company reads its loan exhibits and 8-Ks on EDGAR, which can take up to a minute.</p>
          <div className="mt-3 h-1 overflow-hidden rounded-[2px] bg-zinc-800">
            <div className="h-full w-1/3 animate-pulse rounded-[2px] bg-zinc-500" />
          </div>
        </div>
      ) : null}
      {view && !view.company ? <NoOwner ticker={ticker} /> : null}
      {view?.company && view.assessment ? (
        <OwnerBody view={view} today={today} all={all} onAll={() => setAll(true)} />
      ) : null}
    </div>
  );
}

function NoOwner({ ticker }: { ticker: string }) {
  return (
    <div className="surface max-w-2xl rounded-xs border border-zinc-800 p-5">
      <p className="text-base font-semibold text-zinc-50">No private equity owner in its loan documents</p>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
        None of the 13 sponsors this app follows is defined as &ldquo;Sponsor&rdquo; in {ticker}&apos;s credit agreements or indentures on EDGAR. Public or founder-controlled
        borrowers sit outside the playbook these sponsors share, so the sponsor warning signs do not apply.
      </p>
      <a href="/contagion" className="mt-4 inline-flex items-center gap-1.5 text-xs text-zinc-300 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-50">
        <Network className="h-3.5 w-3.5" aria-hidden /> See the sponsor-backed borrowers that are on watch
      </a>
    </div>
  );
}

function OwnerBody({ view, today, all, onAll }: { view: OwnerView; today: string; all: boolean; onAll: () => void }) {
  const c = view.company!;
  const a = view.assessment!;
  const style = FLAG_STYLE[a.flag];
  const owners = view.families.map((f) => f.name);
  const link = c.sponsors[0];
  const items = signals(c, a);

  return (
    <>
      <section className="surface rounded-xs border border-zinc-800 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Owned by</p>
            <h2 className="mt-1 font-display text-[26px] font-bold leading-tight text-zinc-50">{owners.join(" & ")}</h2>
            <p className="mt-1 text-[13px] text-zinc-400">{verdictLine(c, a)}</p>
          </div>
          <span className={`rounded-xs border px-2.5 py-1 text-xs font-semibold ${style.border} ${style.text}`}>{style.label}</span>
        </div>
        <figure className="mt-4">
          <blockquote className="border-l-2 border-zinc-600 pl-3 text-[12.5px] italic leading-relaxed text-zinc-300">{link.quote.slice(0, 360)}{link.quote.length > 360 ? "..." : ""}</blockquote>
          <figcaption className="mt-1 pl-3.5 font-mono text-[10px] text-zinc-500">
            The sponsor definition in its own loan document, filed {link.filed}.{" "}
            <a href={link.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100">
              EDGAR <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </figcaption>
        </figure>
      </section>

      <section className="mt-6">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Would the owner squeeze its lenders?</h3>
        <p className="mt-1 text-[12px] text-zinc-500">A lender squeeze needs an owner willing to do it, loan documents that allow it, and a reason to.</p>
        <div className="mt-3">
          <SignalGauge items={items} />
        </div>
      </section>

      {a.warning?.sentences.some((s) => s.verified) ? (
        <section className="mt-6 max-w-3xl">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Note to the PM</h3>
          <div className="mt-2 space-y-1.5 text-[13px] leading-relaxed">
            {a.warning.sentences.map((s, i) => (
              <p key={i} className={s.verified ? "text-zinc-200" : "text-zinc-500 line-through decoration-red-600/70"} title={s.reason}>
                {s.text}
              </p>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">Written by Gemini from the graph&apos;s facts; a sentence whose figures are not in the filings is struck.</p>
        </section>
      ) : null}

      {view.families.map((f) => {
        const members = all ? f.members : f.members.slice(0, MAX_ROWS);
        const rows: TimelineRow[] = members.map((m) => ({
          id: m.cik,
          label: m.name,
          sub: [m.ticker, m.self ? "this company" : m.active ? null : m.lastPeriodic ? `stopped filing ${m.lastPeriodic.slice(0, 4)}` : "no 10-K or 10-Q"].filter(Boolean).join(" · ") || undefined,
          end: m.active ? null : m.lastPeriodic,
          ended: !m.active,
          marks: m.events.map((e) => ({ id: e.id, date: e.date, kind: e.kind, title: `${m.name}: ${KIND_SHORT[e.kind]}`, quote: e.quote, url: e.url })),
          highlight: m.self,
          tag: m.flag === "target" ? { text: "Likely next", tone: "red" } : m.flag === "watch" ? { text: "Watch", tone: "amber" } : undefined,
        }));
        const hits = f.members.filter((m) => !m.self && m.events.length);
        const last = hits.flatMap((m) => m.events.map((e) => ({ m, e }))).sort((x, y) => y.e.date.localeCompare(x.e.date))[0];
        return (
          <section key={f.sponsorId} className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{f.name}&apos;s other companies</h3>
                <p className="mt-1 text-[13px] text-zinc-300">
                  {hits.length
                    ? `${hits.length} of ${f.members.length - 1} have squeezed lenders or gone bankrupt since 2016. Most recent: ${last.m.name}, ${KIND_PLAIN[last.e.kind]}, ${month(last.e.date)}.`
                    : `None of its ${f.members.length - 1} other SEC-filing companies has squeezed lenders or gone bankrupt since 2016.`}
                </p>
              </div>
              <a href={`/contagion?company=${c.cik}`} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100">
                <Network className="h-3.5 w-3.5" aria-hidden /> Open in the sponsor network
              </a>
            </div>
            <div className="surface mt-3 rounded-xs border border-zinc-800 p-3">
              <PlaybookTimeline rows={rows} today={today} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-2">
                <TimelineLegend />
                {!all && f.members.length > MAX_ROWS ? (
                  <button type="button" onClick={onAll} className="text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100">
                    Show all {f.members.length}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}

      <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
        {view.live ? `Read from EDGAR ${view.checkedAt.slice(0, 10)}. ` : ""}The sponsor network was built {view.builtAt.slice(0, 10)} from SEC filers only, so private portfolio companies are not
        on the timeline. A screen built on how these owners have behaved, not a fitted probability.
      </p>
    </>
  );
}
