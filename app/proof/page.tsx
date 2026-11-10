import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { AucChart, CalibrationChart, WarningChart } from "@/components/proof/proof-charts";
import { FEATURE_LABELS, type FeatureName } from "@/lib/features";
import backtest from "@/model/backtest.json";

export const metadata: Metadata = { title: "Proof · Signal Watch" };

const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(d)}%`);

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="surface rounded-xs border border-zinc-800 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-zinc-50">{value}</p>
      <p className="mt-1 text-xs leading-snug text-zinc-500">{sub}</p>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> {title}
      </h2>
      {note ? <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-zinc-400">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The backtest: every number scored only with filings that existed on the day, on years after the model's training data. */
export default function ProofPage() {
  const o = backtest.outOfSample;
  const w = backtest.warning;
  const meta = backtest.dataset;
  const importance = Object.entries(backtest.importance).sort((a, b) => b[1] - a[1]);
  const cases = w.cases.slice(0, 30);
  return (
    <div className="min-h-[100dvh]">
      <Header active="proof" />
      <main className="mx-auto max-w-[1100px] px-4 py-10 lg:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-red-600">Proof</p>
        <h1 className="mt-2 font-display text-[30px] font-bold leading-tight text-zinc-50">Did it warn before real bankruptcies?</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
          Every company-quarter from {o.years[0]} to {o.years[1]} was scored by a model trained only on earlier years, using only the figures filed before
          that day. Then we checked what happened next. {meta.eventsInUniverse} companies in the sample filed for bankruptcy; {meta.nonEventSampled.toLocaleString()} others
          were drawn at random from the {meta.universe.toLocaleString()} companies that file XBRL. Mixed results are shown as they came out.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Ranking accuracy (AUC)" value={o.auc.model.toFixed(2)} sub={`Logistic regression ${o.auc.logistic.toFixed(2)}, Altman Z'' ${o.auc.altmanZ.toFixed(2)}. 0.5 is a coin flip.`} />
          <Stat label="Bankruptcies caught" value={`${w.caught} of ${w.bankruptcies}`} sub={`Warning on and staying on, a median ${w.medianMonths?.toFixed(1)} months before the filing.`} />
          <Stat label="False alarms" value={pct(o.atAlert.falseAlarmRate)} sub={`of healthy company-quarters crossed the alert line. Altman Z'' flags ${pct(o.altmanZDistressZone.falseAlarmRate, 0)}.`} />
          <Stat label="Figures from the future" value={String(meta.leakingRows)} sub={`of ${meta.rows.toLocaleString()} scored rows used a figure filed on or after the scoring day.`} />
        </div>

        <Section
          title="When it says 5%, do about 5% fail?"
          note="Filings grouped by predicted probability; each dot is a group. On the dashed line, the stated odds are the real odds. The calibration curve is fitted only on earlier years, like the model. Above 40% it still overstates (60% predicted, 28% filed), on 54 filings."
        >
          <CalibrationChart bins={o.calibration} />
          <table className="mt-4 w-full text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Score range</th>
                <th className="py-1 pr-3 font-medium">Predicted</th>
                <th className="py-1 pr-3 font-medium">Filed</th>
                <th className="py-1 pr-3 font-medium">Filings scored</th>
                <th className="py-1 font-medium">Followed by bankruptcy</th>
              </tr>
            </thead>
            <tbody className="font-mono text-zinc-300">
              {o.calibration.map((b) => (
                <tr key={b.from} className="border-t border-zinc-800/60">
                  <td className="py-1 pr-3">
                    {pct(b.from)} to {pct(b.to, 0)}
                  </td>
                  <td className="py-1 pr-3">{pct(b.predicted, 2)}</td>
                  <td className="py-1 pr-3">{pct(b.observed, 2)}</td>
                  <td className="py-1 pr-3">{b.rows.toLocaleString()}</td>
                  <td className="py-1">{b.bankruptcies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Against the published baseline, year by year" note="AUC for each test year: the chance a company that filed within 12 months scored above one that did not. Each year is scored by models trained only on rows whose outcome was known before that year began.">
          <AucChart years={o.perYear} />
        </Section>

        <Section
          title="How early"
          note={`For each bankruptcy, the first scored filing from which the score stayed above the alert line until the filing. The alert line for each year is the score that 5% of healthy companies exceeded in earlier years, never set on the year it is tested on. ${w.bankruptcies - w.caught} of ${w.bankruptcies} were not caught this way.`}
        >
          <WarningChart bins={w.histogram} />
        </Section>

        <Section title="Leakage audit" note="What stops the backtest from seeing the future, and how each rule is checked.">
          <ul className="space-y-3 text-[13px] leading-relaxed text-zinc-300">
            <li>
              <span className="font-semibold text-zinc-100">Filing dates, never period ends.</span> Each row is scored the day after a 10-K or 10-Q was filed, from facts
              whose filing date is before that day. The training script stops if any row breaks this: {meta.leakingRows} of {meta.rows.toLocaleString()} did.
            </li>
            <li>
              <span className="font-semibold text-zinc-100">First-reported figures.</span> A restatement filed later is invisible at the scoring date, because it was filed
              after it (lib/pit.ts).
            </li>
            <li>
              <span className="font-semibold text-zinc-100">Walk-forward training.</span> A test year&rsquo;s model is fitted only on rows scored more than a year before
              that year starts, so every training label was known.
            </li>
            <li>
              <span className="font-semibold text-zinc-100">No language model in the forecast.</span> The probability is arithmetic on filed figures; Gemini never sees a
              backtest question, so its training data cannot leak into the score.
            </li>
            <li>
              <span className="font-semibold text-zinc-100">Same code live and in the test.</span> The app scores today with the same feature builder (lib/features.ts) the
              backtest used, and the exported trees match scikit-learn to within 1e-8 (scripts/check-model.ts).
            </li>
          </ul>
        </Section>

        <Section title="What drives it" note="Share of the trees' total split gain by input.">
          <ul className="max-w-xl space-y-1.5">
            {importance.map(([f, v]) => (
              <li key={f} className="grid grid-cols-[220px_1fr_48px] items-center gap-3 text-xs">
                <span className="truncate text-zinc-300">{FEATURE_LABELS[f as FeatureName] ?? f}</span>
                <span className="h-2 rounded-r-[4px]" style={{ width: `${(v / importance[0][1]) * 100}%`, background: "var(--series-1)" }} />
                <span className="text-right font-mono text-zinc-400">{pct(v, 0)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="The most recent bankruptcies in the test" note="The last score before each filing, and how many months ahead each method warned and stayed warning.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Company</th>
                  <th className="py-1 pr-3 font-medium">Bankruptcy 8-K</th>
                  <th className="py-1 pr-3 font-medium">Last score</th>
                  <th className="py-1 pr-3 font-medium">Model warned</th>
                  <th className="py-1 font-medium">Altman Z&apos;&apos; warned</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {cases.map((c) => (
                  <tr key={c.cik} className="border-t border-zinc-800/60">
                    <td className="py-1.5 pr-3">{c.name}</td>
                    <td className="py-1.5 pr-3 font-mono">{c.event}</td>
                    <td className="py-1.5 pr-3 font-mono">
                      {pct(c.lastScore)} <span className="text-zinc-500">on {c.lastScoredOn}</span>
                    </td>
                    <td className={`py-1.5 pr-3 font-mono ${c.monthsWarning === null ? "text-zinc-500" : "text-zinc-100"}`}>{c.monthsWarning === null ? "missed" : `${c.monthsWarning.toFixed(0)} months`}</td>
                    <td className="py-1.5 font-mono text-zinc-400">{c.monthsWarningZ === null ? "missed" : `${c.monthsWarningZ.toFixed(0)} months`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">Altman Z&apos;&apos; often warns earlier because it flags most companies: {pct(o.altmanZDistressZone.falseAlarmRate, 0)} of healthy company-quarters sit in its distress zone.</p>
        </Section>

        <Section title="Limits">
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-zinc-400">
            <li>Bankruptcy means an Item 1.03 8-K. A company that stops filing and never reports one counts as a non-event, and some 1.03 filings are subsidiaries.</li>
            <li>Only companies that file XBRL with the SEC, 2012 onward. Private borrowers are not in the test.</li>
            <li>Precision at the alert line is {pct(o.atAlert.precision)}: most alerts are not followed by a filing within a year. It is a screen for what to read first, not a verdict.</li>
            <li>Stock prices are not inputs: delisted companies drop out of free price data, which would bias the test toward survivors.</li>
          </ul>
          <p className="mt-4 font-mono text-[11px] text-zinc-600">
            {backtest.method.model}. Generated {backtest.generatedAt.slice(0, 10)}; data built {String(meta.builtAt).slice(0, 10)}.
          </p>
        </Section>
      </main>
    </div>
  );
}
