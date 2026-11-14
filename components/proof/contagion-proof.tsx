import bt from "@/model/contagion-backtest.json";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const KIND = { lme: "Lender squeeze", restructuring: "Restructuring deal", bankruptcy: "Chapter 11" } as Record<string, string>;
const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

type Group = (typeof bt)["lenient"]["screen"];

/** Two bars: how often flagged companies had an event in the next 24 months, against everyone else. */
function Compare({ title, sub, g }: { title: string; sub: string; g: Group }) {
  const max = Math.max(g.flaggedRate, g.otherRate, 0.01);
  return (
    <div className="surface rounded-xs border border-zinc-800 p-4">
      <p className="text-sm font-semibold text-zinc-50">{title}</p>
      <p className="text-xs text-zinc-500">{sub}</p>
      {[
        { label: "Flagged", rate: g.flaggedRate, n: `${g.flaggedEvents} of ${g.flagged}`, color: "#ef4444" },
        { label: "Everyone else", rate: g.otherRate, n: `${g.otherEvents} of ${g.others}`, color: "rgb(var(--zinc-500))" },
      ].map((b) => (
        <div key={b.label} className="mt-3 text-xs">
          <div className="flex justify-between text-zinc-400">
            <span>{b.label}</span>
            <span className="font-mono text-zinc-200">
              {pct(b.rate)} <span className="text-zinc-500">({b.n})</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-[2px] bg-zinc-800">
            <div className="h-full rounded-[2px]" style={{ width: `${(b.rate / max) * 100}%`, background: b.color }} />
          </div>
        </div>
      ))}
      <p className="mt-3 font-mono text-xs text-zinc-400">
        {g.lift ? `${g.lift.toFixed(1)}x as likely` : "No events among the others"} · p = {g.pValue < 0.001 ? "<0.001" : g.pValue.toFixed(3)}
      </p>
    </div>
  );
}

/** The sponsor contagion screen, backtested point in time. */
export function ContagionProof() {
  const l = bt.lenient;
  const s = bt.strict;
  // Each event once, at the first cutoff that saw it coming (or the last one that missed it).
  const events = new Map<string, { name: string; kind: string; event: string; caught: boolean; cutoff: string; sibling?: string }>();
  for (const c of l.caught) {
    const key = `${c.name}:${c.event}`;
    if (!events.has(key)) events.set(key, { name: c.name, kind: c.kind, event: c.event, caught: true, cutoff: c.cutoff, sibling: c.sibling?.name });
  }
  for (const m of l.missed) {
    const key = `${m.name}:${m.event}`;
    if (!events.has(key)) events.set(key, { name: m.name, kind: m.kind, event: m.event, caught: false, cutoff: m.cutoff });
  }
  const list = [...events.values()].sort((a, b) => a.event.localeCompare(b.event));

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <Compare title="The screen" sub="Sister company's event, plus debt coming due or a weak balance sheet" g={l.screen} />
        <Compare title="Sister company's event alone" sub="Same owner, a bankruptcy or squeeze in the last ten years" g={l.siblingOnly} />
        <Compare title="Balance sheet alone" sub="Debt coming due or the distress model at elevated" g={l.balanceSheetOnly} />
      </div>
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-zinc-400">
        {l.companyYears} company-years ({l.companies} sponsor-backed companies still filing, cutoffs every 1 January from {bt.method.cutoffs[0].slice(0, 4)} to{" "}
        {bt.method.cutoffs.at(-1)?.slice(0, 4)}). Of the {l.distinctEvents} distinct bankruptcies and squeezes that followed, the screen had flagged {l.distinctCaught} beforehand, with{" "}
        {l.falseAlarms} flagged company-years that saw nothing. Adding the sister-company signal to the balance sheet makes a flag more precise ({pct(l.screen.flaggedRate)} of
        flagged companies had an event, against {pct(l.balanceSheetOnly.flaggedRate)} on the balance sheet alone) but catches fewer of them.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-semibold">Event</th>
              <th className="py-2 pr-3 font-semibold">Company</th>
              <th className="py-2 pr-3 font-semibold">Flagged beforehand?</th>
              <th className="py-2 font-semibold">Sister company that triggered it</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={`${e.name}:${e.event}`} className="border-t border-zinc-800">
                <td className="py-2 pr-3 text-zinc-400">
                  {KIND[e.kind] ?? e.kind}, {month(e.event)}
                </td>
                <td className="py-2 pr-3 text-zinc-100">{e.name}</td>
                <td className={`py-2 pr-3 font-semibold ${e.caught ? "text-emerald-500" : "text-zinc-500"}`}>{e.caught ? `Yes, from ${e.cutoff.slice(0, 4)}` : "No"}</td>
                <td className="py-2 text-zinc-400">{e.sibling ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 max-w-3xl text-[12.5px] leading-relaxed text-zinc-400">
        <p className="text-zinc-200">What this does not show</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            Ownership here is read from the credit documents as they stand today, which for JOANN, Container Store and Claritev were filed around their events; the sponsors
            owned them for years before. Counting only documents filed before each cutoff leaves {s.companyYears} company-years and {s.distinctEvents} events, too few to test (
            {s.distinctCaught} of {s.distinctEvents} flagged).
          </li>
          <li>Cutoffs a year apart with a 24-month horizon count some companies twice, and the p-values treat company-years as independent, so they overstate the confidence.</li>
          <li>The loophole rule is left out: the scans read today&apos;s loan documents, so using them for an earlier year would leak.</li>
          {bt.caveats.slice(0, 2).map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-2 font-mono text-[11px] text-zinc-500">scripts/backtest-contagion.ts · run {bt.generatedAt.slice(0, 10)}</p>
      </div>
    </>
  );
}
