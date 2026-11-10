import type { Report } from "@/types";
import { toIsoDate } from "./dates";
import { scoreDistress } from "./distress";
import { getSubmissions } from "./edgar";
import { filingChange } from "./filing-change";
import { fetchFedPath } from "./kalshi";
import { rateStress } from "./rate-stress";
import { saveDistressScore, saveFedSnapshot, tigerEnabled } from "./tiger";
import { fetchFacts } from "./xbrl";

/**
 * Adds the forecast layer to a report: the distress probability, the filing
 * change score and the rate stress. New reports get it as they are built;
 * reports saved before it existed get it the first time they are opened. The
 * rate stress follows the market, so it is rebuilt once a day.
 */
export async function ensureForecast(report: Report, today = toIsoDate(new Date())): Promise<{ report: Report; changed: boolean }> {
  const company = report.graph.company;
  const needDistress = !report.distress || report.distress.asOf !== today;
  const needChange = report.filingChange === undefined;
  const needRates = !report.rateStress || report.rateStress.fetchedAt.slice(0, 10) !== today;
  if (!needDistress && !needChange && !needRates) return { report, changed: false };

  const book = await fetchFacts(company.cik).catch(() => null);
  const [distress, change, path] = await Promise.all([
    needDistress && book ? Promise.resolve(scoreDistress(book, company.cik, today)) : Promise.resolve(report.distress ?? null),
    needChange
      ? getSubmissions(company.cik)
          .then((s) => filingChange(s.filings))
          .catch((error: unknown) => {
            console.warn(`Filing change for ${company.ticker} failed`, error);
            return null;
          })
      : Promise.resolve(report.filingChange ?? null),
    needRates ? fetchFedPath().catch(() => null) : Promise.resolve(null),
  ]);
  const stress = path ? rateStress(report.capital, book, path, today) : (report.rateStress ?? null);

  if (tigerEnabled()) {
    if (distress && needDistress) await saveDistressScore(company.ticker, report.asOf ? null : report.id, distress).catch(() => undefined);
    if (path) await saveFedSnapshot(today, path).catch(() => undefined);
  }
  return { report: { ...report, distress, filingChange: change, rateStress: stress }, changed: true };
}
