import type { CommitteeRecord, Report } from "@/types";
import { TRAPDOOR_LABELS } from "../lme-labels";
import { Referee } from "./referee";

export interface Suggestion {
  /** Why this question is worth asking, in a few words. */
  why: string;
  question: string;
}

/**
 * Questions worth putting to the committee, picked by code from what the
 * debate left open and what the report found: points nobody rebutted, the
 * Chair's watch list, trapdoor clauses, the next maturity and the rate path.
 * Most specific first; never more than six.
 */
export function suggestQuestions(report: Report, record: CommitteeRecord | null): Suggestion[] {
  const out: Suggestion[] = [];
  const asked = new Set((record?.turns ?? []).filter((t) => t.speaker === "user").map((t) => t.text.toLowerCase()));
  const add = (why: string, question: string) => {
    if (!asked.has(question.toLowerCase()) && !out.some((s) => s.question === question)) out.push({ why, question });
  };

  if (record) {
    const ref = new Referee([]);
    for (const t of record.turns) ref.record(t);
    for (const p of Array.from(ref.points.values()).filter((x) => x.status !== "rebutted")) {
      const turn = record.turns.find((t) => t.id === p.turnId);
      if (!turn?.evidence) continue;
      add(p.status === "conceded" ? "Conceded, not resolved" : "Nobody answered it", `What would have to be true for "${turn.evidence.title}" not to matter to us?`);
    }
    // A point that was rebutted only on the second try is still contested.
    for (const p of Array.from(ref.points.values()).filter((x) => x.status === "rebutted" && x.counters > 0)) {
      const turn = record.turns.find((t) => t.id === p.turnId);
      if (turn?.evidence) add("Came back after a rebuttal", `The Devil's Advocate kept pressing on "${turn.evidence.title}". What would settle it for good?`);
    }
    for (const w of record.chair?.watch.slice(0, 2) ?? []) {
      const item = w.item.replace(/\.$/, "");
      add(`The Chair's open item (${w.when})`, `${item.charAt(0).toUpperCase()}${item.slice(1)}: what result there would change the case?`);
    }
  }

  for (const c of (report.lme?.clauses ?? []).filter((x) => x.verified && x.status === "door_open").slice(0, 2)) {
    add(`${TRAPDOOR_LABELS[c.trapdoor]} clause left open`, `Could ${c.section ?? `the ${TRAPDOOR_LABELS[c.trapdoor]} clause`} be used to move value away from us before the next maturity?`);
  }
  const maturity = report.capital?.metrics.find((m) => m.key === "next_maturity");
  if (maturity && maturity.display !== "Not disclosed") add("Refinancing risk", `Does liquidity cover the next maturity (${maturity.display}) without new money?`);
  const top = report.distress?.reasons[0];
  if (top) add("Biggest driver of the probability", `What would bring ${top.label.toLowerCase()} back to a safer level, and how soon could it?`);
  if ((report.rateStress?.floatingDebt ?? 0) > 0) add("Rate exposure", "How much does the market's stress path for the Fed add to interest cost, and does it change the runway?");
  if (report.filingChange?.flagged) add("The filing was rewritten", "What did management add to the risk factors this year that it did not say last year?");
  return out.slice(0, 6);
}
