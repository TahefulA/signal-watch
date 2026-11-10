import type { Report } from "@/types";
import { toIsoDate } from "./dates";
import { scanCreditDocuments } from "./lme-scanner";

/**
 * Adds the credit document scan to a report the first time it is needed.
 * A company with no indenture or credit agreement on EDGAR is saved as null;
 * a failed scan is left undefined so the next open tries again.
 */
export async function ensureLme(report: Report, today = toIsoDate(new Date()), trace?: (text: string) => void): Promise<{ report: Report; changed: boolean }> {
  if (report.lme !== undefined) return { report, changed: false };
  try {
    const lme = await scanCreditDocuments(report.graph.company.cik, today, trace);
    return { report: { ...report, lme }, changed: true };
  } catch (error) {
    console.warn(`Credit document scan for ${report.graph.company.ticker} failed`, error);
    return { report, changed: false };
  }
}
