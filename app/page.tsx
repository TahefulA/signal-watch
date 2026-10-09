import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { BacktestNote } from "@/components/home/backtest-note";
import { MethodNotes } from "@/components/home/method-notes";
import { SignalList } from "@/components/home/signal-list";
import { getSummaries } from "@/lib/data";
import { getBacktest } from "@/lib/backtest-store";

export const revalidate = 3600;

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export default async function HomePage() {
  const summaries = await getSummaries();
  const backtest = getBacktest();
  const count = COUNT_WORDS[summaries.length] ?? String(summaries.length);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-6 py-8 md:px-12">
        <div className="max-w-3xl space-y-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            {count} companies are on the watchlist, ranked by where their filings, insiders and markets disagree.
          </h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            Open a company to see its risk score for the last 90 days. Select any day to see what moved it, then open
            the sentence in the filing that caused it.
          </p>
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <SignalList summaries={summaries} />
          <div className="space-y-8">
            {backtest ? <BacktestNote result={backtest} /> : null}
            <MethodNotes />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
