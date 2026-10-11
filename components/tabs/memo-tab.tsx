"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { MemoSpan, Report } from "@/types";
import { Button } from "@/components/ui/button";
import { CounterArgumentColumn } from "@/components/memo/counter-argument-column";
import { DevilsCase } from "@/components/memo/devils-case";

interface MemoTabProps {
  report: Report;
  briefBusy: boolean;
  briefError: string | null;
  onPrepareBrief: () => void;
  devilBusy: boolean;
  devilError: string | null;
  onArgue: () => void;
  /** Opens an entity on the Graph tab. */
  onEntityClick: (id: string) => void;
}

function Spans({ spans, onEntityClick }: { spans: MemoSpan[]; onEntityClick: (id: string) => void }) {
  return (
    <>
      {spans.map((s, i) =>
        s.entityId ? (
          <button
            key={i}
            type="button"
            onClick={() => onEntityClick(s.entityId as string)}
            className="text-zinc-100 underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            {s.text}
          </button>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

const text = (spans: MemoSpan[]) => spans.map((s) => s.text).join("");

/** The Devil's Advocate as plain text for Copy memo, with every section and its evidence tables. */
function devilText(report: Report): string[] {
  const d = report.devil;
  if (!d?.argument.length) return [];
  if (!d.sections) return ["DEVIL'S ADVOCATE", text(d.argument), ...(d.whatToWatch ? [`What to watch: ${d.whatToWatch}`] : []), ""];
  const p = d.period;
  return [
    "DEVIL'S ADVOCATE: THE CASE AGAINST THE MEMO",
    ...(p ? [`Based on ${p.quarter ?? "the latest quarter"}${p.periodEnd ? `, quarter ended ${p.periodEnd}` : ""}${p.form && p.filed ? `, ${p.form} filed ${p.filed}` : ""}. Written ${p.writtenOn}.`] : []),
    "",
    ...(d.primer ? ["READ THIS FIRST", d.primer, ""] : []),
    "BOTTOM LINE",
    text(d.bottomLine ?? d.argument),
    "",
    ...d.sections.flatMap((s, i) => [
      `${i + 1}. ${s.themeLabel.toUpperCase()} (${s.strength})`,
      s.headline,
      ...(s.memoSays ? [`What the memo says: ${s.memoSays}`] : []),
      text(s.argument),
      ...(s.plainEnglish ? [`In plain English: ${s.plainEnglish}`] : []),
      ...(s.whyItMatters ? [`Why it matters to a lender: ${s.whyItMatters}`] : []),
      ...s.exhibits.flatMap((x) => ["", `  ${x.title}`, `  ${x.columns.join(" | ")}`, ...x.rows.map((r) => `  ${r.join(" | ")}`)]),
      ...(s.citations.length ? [`Sources: ${s.citations.map((c) => c.source).join("; ")}`] : []),
      "",
    ]),
    ...(d.events?.length ? ["TIMELINE", ...d.events.map((e) => `${e.date}  ${e.text}`), ""] : []),
    ...(d.rebuttal ? ["THE OTHER SIDE", d.rebuttal, ""] : []),
    ...(d.watchList?.length ? ["WHAT TO WATCH", ...d.watchList.map((w) => `- ${w.item} (${w.when}): ${w.signal}`), ""] : []),
    ...(d.glossary?.length ? ["TERMS", ...d.glossary.map((g) => `${g.term}: ${g.meaning}`), ""] : []),
  ];
}

/** The written output in a reading column: signal summary, the five memo sections and meeting prep. */
export function MemoTab({ report, briefBusy, briefError, onPrepareBrief, devilBusy, devilError, onArgue, onEntityClick }: MemoTabProps) {
  const [copied, setCopied] = useState(false);
  const company = report.graph.company;
  const brief = report.brief;

  async function copy() {
    const parts = [
      `CREDIT MEMO: ${company.ticker} · ${company.name}`,
      `Generated ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC`,
      "",
      ...(report.signal?.length ? ["SIGNAL SUMMARY", text(report.signal), ""] : []),
      ...report.memo.sections.flatMap((s) => [s.title.toUpperCase(), text(s.spans), ""]),
      ...devilText(report),
      ...(brief?.questions.length ? ["MEETING PREP", ...brief.questions.map((q, i) => `${i + 1}. ${text(q.spans)}`)] : []),
    ];
    try {
      await navigator.clipboard.writeText(parts.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-12 lg:px-12">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-8">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Credit memo</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-zinc-50">
            {company.ticker} · {company.name}
          </h2>
          <p className="mt-1 font-mono text-xs text-zinc-600">Generated {report.generatedAt.slice(0, 16).replace("T", " ")} UTC</p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xs border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied ? "Copied" : "Copy memo"}
        </button>
      </div>

      <div className="mt-2 grid gap-10 lg:grid-cols-2 lg:gap-6">
        <div className="memo-column min-w-0">
          {report.signal?.length ? (
            <section className="mt-10">
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Memo &middot; signal summary</h3>
              <p className="border-l-[3px] border-red-600 bg-zinc-900 p-6 text-base font-medium leading-[1.7] text-zinc-200">
                <Spans spans={report.signal} onEntityClick={onEntityClick} />
              </p>
            </section>
          ) : null}

          {report.memo.sections.map((s) => (
            <section key={s.key} className="mt-10 border-t border-zinc-800 pt-10">
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{s.title}</h3>
              <p className="text-[15px] leading-[1.8] text-zinc-200">
                <Spans spans={s.spans} onEntityClick={onEntityClick} />
              </p>
            </section>
          ))}

          <section className="mt-10 border-t border-zinc-800 pt-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Meeting prep</h3>
              <div className="flex gap-2">
                {brief ? (
                  <a
                    href={`/brief/${report.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xs border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> One-page brief
                  </a>
                ) : null}
                <Button
                  onClick={onPrepareBrief}
                  disabled={briefBusy}
                  variant={brief ? "secondary" : "primary"}
                  className="px-2.5 py-1.5 text-xs"
                >
                  {briefBusy ? "Preparing..." : brief ? "Prepare again" : "Prepare meeting brief"}
                </Button>
              </div>
            </div>
            {briefError ? (
              <p className="mb-3 text-sm text-red-400" role="alert">
                {briefError}
              </p>
            ) : null}
            {brief ? (
              <>
                <p className="mb-3 text-[15px] text-zinc-400">If you&rsquo;re meeting {company.ticker} management tomorrow:</p>
                <ol className="list-decimal space-y-3 pl-5 text-[15px] leading-[1.8] text-zinc-200">
                  {brief.questions.map((q, i) => (
                    <li key={i}>
                      <Spans spans={q.spans} onEntityClick={onEntityClick} />
                      {q.basis ? <span className="block text-xs leading-relaxed text-zinc-500">Why: {q.basis}</span> : null}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-[15px] text-zinc-500">
                Questions to ask management, drafted from the gaps in this report. Prepare the brief to add them.
              </p>
            )}
          </section>

          <p className="mt-12 border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-600">
            Drafted by Gemini from the {report.sources.length} sources behind the map. Any sentence with a figure not in the report was
            removed. Underlined names open their box on the Graph tab.
          </p>
        </div>
        <div className="min-w-0 pt-10 lg:sticky lg:top-0 lg:self-start">
          <CounterArgumentColumn devil={report.devil} busy={devilBusy} error={devilError} onRun={onArgue} onEntityClick={onEntityClick} />
        </div>
      </div>

      {report.devil?.sections?.length ? <DevilsCase devil={report.devil} onEntityClick={onEntityClick} /> : null}
    </div>
  );
}
