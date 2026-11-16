import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Gauge } from "@/components/summary/gauge";
import { OWNER, VERDICT, bandOf, oneIn, pctText, sentence, summaryFacts } from "@/lib/summary-words";
import { findLatestReport, tigerEnabled } from "@/lib/tiger";

/** Rebuilt at most hourly; the warm-up cron refreshes the reports behind it. */
export const revalidate = 3600;

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** One report read per request, shared by the metadata and the page. */
const load = cache(async (raw: string) => {
  const ticker = decodeURIComponent(raw).toUpperCase();
  if (!TICKER.test(ticker)) return null;
  const report = tigerEnabled() ? await findLatestReport(ticker).catch(() => null) : null;
  return { ticker, report };
});

export async function generateMetadata({ params }: { params: { ticker: string } }): Promise<Metadata> {
  const data = await load(params.ticker);
  if (!data) return {};
  const { ticker, report } = data;
  const d = report?.distress;
  const name = report?.graph.company.name ?? ticker;
  const title = d ? `${name} (${ticker}): ${bandOf(d.band).label.toLowerCase()} bankruptcy risk` : `Could ${name} go bankrupt?`;
  const description = d
    ? `${VERDICT[d.band]} About ${oneIn(d.probability)} chance of a bankruptcy filing in the next 12 months, from its SEC filings up to ${d.periodEnd}.`
    : `Check ${ticker}'s 12-month bankruptcy risk from its SEC filings, free.`;
  return {
    title: `${title} · Signal Watch`,
    description,
    alternates: { canonical: `/c/${ticker}` },
    openGraph: { title, description, url: `/c/${ticker}`, siteName: "Signal Watch", type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** The public, shareable answer for one company: server-rendered, so link previews and search engines see it. */
export default async function SharePage({ params }: { params: { ticker: string } }) {
  const data = await load(params.ticker);
  if (!data) notFound();
  const { ticker, report } = data;
  const open = `/company?ticker=${encodeURIComponent(ticker)}`;

  if (!report) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="font-display text-[32px] font-semibold leading-tight text-zinc-50">Could {ticker} go bankrupt in the next year?</h1>
          <p className="mt-4 text-[15px] text-zinc-400">Nobody has checked {ticker} yet. It takes about a minute: Signal Watch reads its latest SEC filings and scores them.</p>
          <Link href={open} className="mt-6 inline-flex h-10 items-center gap-2 rounded-xs bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">
            Check {ticker} now <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const d = report.distress;
  const name = report.graph.company.name;
  const facts = summaryFacts(report);
  const band = d ? bandOf(d.band) : null;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {ticker} · checked {report.generatedAt.slice(0, 10)}
        </p>
        <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-zinc-50 sm:text-[32px]">Could {name} go bankrupt in the next year?</h1>

        {d && band ? (
          <section className="surface mt-6 flex flex-col items-center gap-4 rounded-xs border border-zinc-800 p-5 sm:flex-row sm:gap-8">
            <div className="flex shrink-0 flex-col items-center">
              <Gauge band={d.band} />
              <p className={`-mt-2 text-lg font-bold ${band.text}`}>{band.label} risk</p>
            </div>
            <div className="min-w-0">
              <p className="text-lg text-zinc-100">{VERDICT[d.band]}</p>
              <p className="mt-2 text-sm text-zinc-400">
                About <span className="font-semibold text-zinc-100">{oneIn(d.probability)}</span> chance of a bankruptcy filing in the next 12 months ({pctText(d.probability)}). The average
                company in the model&rsquo;s data is {oneIn(d.baseRate)}.
              </p>
              <p className="mt-2 text-xs text-zinc-500">From its SEC filings up to {d.periodEnd}. A model trained on past bankruptcies computes it; no AI guesses the number.</p>
            </div>
          </section>
        ) : (
          <p className="surface mt-6 rounded-xs border border-zinc-800 p-4 text-sm text-zinc-400">There isn&rsquo;t enough filed financial data to score this company.</p>
        )}

        {d ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <section className="surface rounded-xs border border-zinc-800 p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-red-500">What worries the model</h2>
              <ul className="mt-2 space-y-2">
                {d.reasons.length ? (
                  d.reasons.map((r) => (
                    <li key={r.feature} className="flex gap-2 text-sm text-zinc-200">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
                      {sentence(r, true)}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-zinc-400">Nothing stands out.</li>
                )}
              </ul>
            </section>
            <section className="surface rounded-xs border border-zinc-800 p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">What&rsquo;s in its favour</h2>
              <ul className="mt-2 space-y-2">
                {d.offsets.length ? (
                  d.offsets.map((r) => (
                    <li key={r.feature} className="flex gap-2 text-sm text-zinc-200">
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                      {sentence(r, false)}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-zinc-400">Nothing stands out.</li>
                )}
              </ul>
            </section>
          </div>
        ) : null}

        {d ? (
          <p className="surface mt-4 rounded-xs border border-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-300">
            <span className="font-semibold text-zinc-100">If you own the stock: </span>
            {OWNER[d.band]}
          </p>
        ) : null}

        {facts.length ? (
          <ul className="mt-4 space-y-1 text-sm text-zinc-300">
            {facts.map((f) => (
              <li key={f.text} className="flex gap-2">
                <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${f.bad ? "bg-red-500" : "bg-zinc-500"}`} aria-hidden />
                {f.text}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={open} className="inline-flex h-10 items-center gap-2 rounded-xs bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">
            Open the full report <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <span className="text-xs text-zinc-500">The debate, its debt schedule, who it&rsquo;s tied to, and the credit memo with sources. Watch it to get alerts.</span>
        </div>
        <p className="mt-8 text-xs text-zinc-600">
          Not investment advice. Estimates from public filings; they can be wrong. <Link href="/proof" className="underline underline-offset-2 hover:text-zinc-300">How accurate is it?</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}
