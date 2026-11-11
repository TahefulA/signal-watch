"use client";

import { AlertTriangle, Check, ExternalLink, X } from "lucide-react";
import type { ContagionAssessment, ContagionCompany, ContagionMap } from "@/types";
import { TRAPDOOR_LABELS } from "@/lib/lme-labels";
import { compactMoney } from "@/lib/node-visuals";
import { BAND_STYLE } from "@/components/distress/distress-card";
import { FLAG_STYLE } from "./language";

const RISK_TEXT = { high: "Open", medium: "Open, partly blocked", low: "Blocked", not_found: "Not found" } as const;
const RISK_TONE = { high: "text-red-500", medium: "text-amber-500", low: "text-emerald-500", not_found: "text-zinc-500" } as const;

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{children}</p>;
}

function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100">
      {children} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

/** The maturity wall in two bars: principal due in each of the next two years against total debt. */
function MaturityBars({ c }: { c: ContagionCompany }) {
  if (!c.due || !c.debt) return <p className="mt-1 text-xs text-zinc-500">No maturity schedule tagged in the latest filings.</p>;
  const rows = [
    { label: "Next 12 months", value: c.due.next12 },
    { label: "Months 13 to 24", value: c.due.year2 },
  ];
  return (
    <div className="mt-1 space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="text-[11px]">
          <div className="flex justify-between text-zinc-400">
            <span>{r.label}</span>
            <span className="font-mono text-zinc-200">{r.value === null ? "n/a" : compactMoney(r.value)}</span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-[2px] bg-zinc-800">
            <div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, ((r.value ?? 0) / c.debt!.value) * 100)}%`, background: "var(--series-1)" }} />
          </div>
        </div>
      ))}
      <p className="text-[10px] text-zinc-500">
        Of {compactMoney(c.debt.value)} total debt, balance sheet {c.due.asOf}. <Source href={c.due.url}>Filing</Source>
      </p>
    </div>
  );
}

export function ContagionPanel({ map, entry, onPick }: { map: ContagionMap; entry: { c: ContagionCompany; a: ContagionAssessment } | null; onPick: (cik: string) => void }) {
  if (!entry) {
    return (
      <aside className="surface rounded-xs border border-zinc-800 p-4 text-[13px] leading-relaxed text-zinc-400">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Pick a company</p>
        <p className="mt-2">
          Click a circle to see why it is flagged: the sister company&apos;s event that reaches it, the loopholes in its own loan documents, the debt coming due and its
          bankruptcy probability, each with the filing it came from.
        </p>
        <p className="mt-2 text-zinc-500">A tag on a circle marks a company that has already filed for bankruptcy or squeezed its lenders.</p>
      </aside>
    );
  }
  const { c, a } = entry;
  const style = FLAG_STYLE[a.flag];
  const sponsorName = (id: string) => map.sponsors.find((s) => s.id === id)?.name ?? id;
  const allFired = a.rules.every((r) => r.fired);
  const maturity = a.rules.find((r) => r.key === "maturity");

  return (
    <aside className="surface max-h-[860px] overflow-y-auto rounded-xs border border-zinc-800 p-4" aria-live="polite">
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>{style.label}</p>
      <h3 className="mt-1 text-base font-semibold text-zinc-50">
        {c.name} {c.ticker ? <span className="font-mono text-sm text-zinc-500">{c.ticker}</span> : null}
      </h3>
      <p className="text-[11px] text-zinc-500">
        {c.active ? `Latest 10-K or 10-Q filed ${c.lastPeriodic}` : `No 10-K or 10-Q since ${c.lastPeriodic ?? "before 2016"}`}
      </p>

      {allFired && a.window ? (
        <div className="mt-3 flex items-start gap-2 rounded-xs border border-red-700/60 bg-red-950/30 p-2 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Watch the window before {a.window.slice(0, 7)}.</span> Lender squeezes tend to come ahead of debt the company cannot refinance
            on its own terms.
          </span>
        </div>
      ) : null}

      <Label>Warning signs · {a.rules.filter((r) => r.fired).length} of 4 on</Label>
      <ul className="mt-1 space-y-1.5">
        {a.rules.map((r) => (
          <li key={r.key} className="flex gap-2 text-xs leading-snug">
            {r.fired ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Fired" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" aria-label="Did not fire" />}
            <span className={r.fired ? "text-zinc-200" : "text-zinc-500"}>
              {r.text} {r.url ? <Source href={r.url}>Source</Source> : null}
            </span>
          </li>
        ))}
      </ul>

      {a.warning?.sentences.length ? (
        <>
          <Label>Note to the PM</Label>
          <div className="mt-1 space-y-1.5 text-[12.5px] leading-relaxed">
            {a.warning.sentences.map((s, i) => (
              <p key={i} className={s.verified ? "text-zinc-200" : "text-zinc-500 line-through decoration-red-600/70"} title={s.reason}>
                {s.text}
                {!s.verified ? <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-red-500 no-underline">Struck</span> : null}
              </p>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">Written by Gemini from the graph&apos;s facts; figures checked by code.</p>
        </>
      ) : null}

      {a.trigger ? (
        <>
          <Label>The sister company&apos;s event</Label>
          <button type="button" onClick={() => onPick(a.trigger!.cik)} className="mt-1 text-left text-xs font-medium text-zinc-100 underline decoration-zinc-700 underline-offset-2">
            {a.trigger.name}
          </button>
          <p className="text-[11px] text-zinc-500">
            {a.trigger.degrees} step{a.trigger.degrees === 1 ? "" : "s"} away: {a.trigger.path.join(", then ")}
          </p>
          <blockquote className="mt-1 border-l-2 border-zinc-700 pl-2 text-[11.5px] leading-snug text-zinc-300">&ldquo;{a.trigger.event.quote}&rdquo;</blockquote>
          <p className="mt-1 text-[10px] text-zinc-500">
            8-K filed {a.trigger.event.date}, found by &ldquo;{a.trigger.event.term}&rdquo;. <Source href={a.trigger.event.url}>8-K</Source>
          </p>
        </>
      ) : null}

      {c.events.length ? (
        <>
          <Label>Its own events</Label>
          <ul className="mt-1 space-y-2">
            {c.events.map((e) => (
              <li key={e.id} className="text-[11.5px] leading-snug text-zinc-300">
                <span className="font-mono text-zinc-500">{e.date}</span> {e.term}: &ldquo;{e.quote.slice(0, 220)}
                {e.quote.length > 220 ? "..." : ""}&rdquo; <Source href={e.url}>8-K</Source>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <Label>Loopholes in its loan documents</Label>
      {c.lme ? (
        <>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {c.lme.verdicts.map((v) => (
              <div key={v.trapdoor} className="rounded-xs border border-zinc-800 px-2 py-1">
                <p className="text-[10px] text-zinc-500">{TRAPDOOR_LABELS[v.trapdoor]}</p>
                <p className={`text-[11px] font-semibold ${RISK_TONE[v.risk]}`}>{RISK_TEXT[v.risk]}</p>
              </div>
            ))}
          </div>
          {c.lme.open.slice(0, 3).map((o, i) => (
            <div key={i} className="mt-2 text-[11.5px] leading-snug">
              <p className="text-zinc-400">
                {TRAPDOOR_LABELS[o.trapdoor]} · {o.section ?? "Section not found"}
              </p>
              <blockquote className="border-l-2 border-red-700/60 pl-2 text-zinc-300">&ldquo;{o.quote.slice(0, 260)}{o.quote.length > 260 ? "..." : ""}&rdquo;</blockquote>
              <Source href={o.url}>Document</Source>
            </div>
          ))}
        </>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">{c.lme === null ? "No indenture or credit agreement found on EDGAR." : "Not checked: the check runs on live companies a sister company's event reaches."}</p>
      )}

      <Label>Bankruptcy probability</Label>
      {c.distress ? (
        <p className="mt-1 text-xs text-zinc-300">
          <span className={`font-mono text-lg font-semibold ${BAND_STYLE[c.distress.band].text}`}>{(c.distress.probability * 100).toFixed(1)}%</span> within 12 months,{" "}
          {BAND_STYLE[c.distress.band].label.toLowerCase()}, balance sheet {c.distress.periodEnd}.{" "}
          <a href="/proof" className="text-zinc-400 underline decoration-zinc-700 underline-offset-2">
            How it was tested
          </a>
        </p>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">No recent balance sheet to score.</p>
      )}

      <Label>Debt coming due</Label>
      <MaturityBars c={c} />
      {maturity && !allFired ? <p className="mt-1 text-[11px] text-zinc-500">{maturity.text}</p> : null}

      <Label>Owner, as its loan document defines it</Label>
      {c.sponsors.map((s) => (
        <div key={s.sponsorId} className="mt-1 text-[11.5px] leading-snug">
          <p className="font-medium text-zinc-200">{sponsorName(s.sponsorId)}</p>
          <blockquote className="border-l-2 border-zinc-700 pl-2 text-zinc-400">{s.quote.slice(0, 320)}{s.quote.length > 320 ? "..." : ""}</blockquote>
          <Source href={s.documentUrl}>Filed {s.filed}</Source>
        </div>
      ))}

      {c.agent ? (
        <>
          <Label>Bank running its loan</Label>
          <p className="mt-1 text-xs text-zinc-300">
            {c.agent.name} <Source href={c.agent.url}>Credit agreement</Source>
          </p>
        </>
      ) : null}

      {c.ticker && c.active ? (
        <a href={`/company?ticker=${c.ticker}&tab=owner`} className="mt-5 inline-flex rounded-xs border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-400">
          Open the full analysis for {c.ticker}
        </a>
      ) : null}
    </aside>
  );
}
