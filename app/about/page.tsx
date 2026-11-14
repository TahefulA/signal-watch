import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import backtest from "@/model/backtest.json";

export const metadata: Metadata = { title: "About · Signal Watch" };

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/** What Signal Watch is, who it is for, and what it cannot do. Every figure is read from model/backtest.json. */
export default function AboutPage() {
  const o = backtest.outOfSample;
  const w = backtest.warning;
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-[32px] font-semibold leading-tight text-zinc-50">About Signal Watch</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
          Signal Watch answers one question: could this company go broke in the next year? It is free, it reads only public sources, and it shows its work.
        </p>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-zinc-400">Who it is for</h2>
        <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-zinc-300">
          <li>
            <span className="font-semibold text-zinc-100">Anyone holding a stock or bond</span>, working at a company, or selling to one: the Summary tab gives the answer in plain English.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">Credit analysts</span>: the watchlist, the committee debate, the debt schedule, loan-document trapdoors and sponsor contagion sit one
            click below.
          </li>
        </ul>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-zinc-400">How the number is made</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-300">
          A gradient-boosted tree model reads 13 figures from the company&rsquo;s SEC filings and gives the chance of a bankruptcy filing within 12 months. It was trained on{" "}
          {backtest.dataset.universe.toLocaleString("en-US")} filers from {backtest.dataset.firstObservation.slice(0, 4)} on, including {backtest.dataset.eventsInUniverse} that went bankrupt. Code
          computes it; no AI touches the number. The AI writes the memo and argues both sides, and code checks every figure it cites against the filings.
        </p>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-zinc-400">How well it has worked</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-300">
          Tested year by year on data the model had not seen ({o.years[0]} to {o.years[1]}, {o.bankruptCompanies} bankrupt companies): it ranks a future bankruptcy above a survivor{" "}
          {pct(o.auc.model)} of the time, against {pct(o.auc.altmanZ)} for the classic Altman Z-score. It flagged {w.caught} of {w.bankruptcies} bankruptcies in advance, a median{" "}
          {w.medianMonths.toFixed(0)} months before the filing.{" "}
          <Link href="/proof" className="text-zinc-100 underline decoration-zinc-600 underline-offset-2">
            The full track record
          </Link>
          .
        </p>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-zinc-400">Limits</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-zinc-300">
          <li>It predicts bankruptcy, not the stock price. A safe company can still be a bad investment.</li>
          <li>
            Most flagged companies do not go bankrupt: at the alert level about {pct(o.atAlert.precision)} of flags were followed by a filing within a year. A flag means look closer.
          </li>
          <li>It only covers companies that file with the SEC, and only knows what they have filed.</li>
          <li>News is read and argued over, but it does not change the probability; there is no reliable history to weigh it with.</li>
          <li>Not financial advice.</li>
        </ul>
      </main>
      <Footer />
    </div>
  );
}
