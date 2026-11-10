import type { PatternResult, Report } from "@/types";
import { loadPatternContext, runPatterns } from "../devils-advocate-patterns";

/** The contradiction checks for a report: the saved ones when the written case exists, otherwise run now (code only, no model). */
export async function patternsFor(report: Report, today: string): Promise<PatternResult[]> {
  if (report.devil?.patterns?.length) return report.devil.patterns;
  try {
    return runPatterns(await loadPatternContext(report, today));
  } catch (error) {
    console.warn("Patterns for the committee failed", error);
    return [];
  }
}
