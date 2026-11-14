/**
 * One-line definitions for the credit terms the analyst views use, so a
 * general reader can hover instead of leaving the page. Each entry matches by
 * pattern, longest first, so "Net debt" wins over "debt".
 */
export interface GlossaryEntry {
  term: string;
  pattern: RegExp;
  text: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: "Altman Z''", pattern: /altman/i, text: "A classic 1960s-era score built from balance-sheet ratios. Below 1.1 is the 'distress zone'. Shown as a benchmark for the model." },
  { term: "Debt / EBITDA", pattern: /debt\s*\/\s*ebitda|leverage/i, text: "How many years of operating profit it would take to repay the debt. Above 4–5x is usually considered heavy." },
  { term: "Interest coverage", pattern: /ebitda\s*\/\s*interest|interest coverage|income to interest/i, text: "Operating profit divided by interest owed. Below 2x means a bad year could leave it unable to pay interest." },
  { term: "Net debt", pattern: /net debt/i, text: "Total debt minus cash on hand: what it would still owe if it used all its cash to pay lenders." },
  { term: "EBITDA", pattern: /ebitda/i, text: "Earnings before interest, taxes, depreciation and amortization: a rough measure of the cash profit from running the business." },
  { term: "Free cash flow", pattern: /free cash flow|\bfcf\b/i, text: "Cash from operations minus spending on equipment and buildings. Negative means it is burning cash." },
  { term: "Revolver", pattern: /revolver|revolving/i, text: "A credit line from banks the company can draw on, like a corporate credit card." },
  { term: "Liquidity", pattern: /liquidity|cash available/i, text: "Cash plus whatever it can still borrow on its credit lines: the money it can reach now." },
  { term: "Maturity", pattern: /maturit/i, text: "The date a loan or bond must be repaid in full. Large amounts due soon are a risk if it cannot borrow again." },
  { term: "Runway", pattern: /runway|cash runs out/i, text: "How long current cash lasts at the latest rate of cash burn, if nothing changes and no new money comes in." },
  { term: "Secured debt", pattern: /secured/i, text: "Debt backed by specific assets. Secured lenders are repaid first in a bankruptcy." },
  { term: "Current ratio", pattern: /current ratio/i, text: "Assets that turn into cash within a year, divided by bills due within a year. Below 1 is tight." },
  { term: "Liability management", pattern: /\blme\b|liability management|trapdoor/i, text: "Deals where a struggling company reshuffles its debt, often moving assets away from some lenders to raise new money. Loan documents decide what is allowed." },
  { term: "Credit rating", pattern: /credit rating/i, text: "A grade from S&P, Moody's or Fitch on the chance of default. BBB- and above is 'investment grade'; below that is 'junk'." },
  { term: "Covenant", pattern: /covenant/i, text: "A promise in a loan agreement, such as keeping debt below a set multiple of profit. Breaking one can let lenders demand repayment." },
  { term: "Sponsor", pattern: /sponsor/i, text: "The private-equity firm that owns the company. Some sponsors have a history of aggressive debt deals." },
  { term: "8-K", pattern: /\b8-K\b/, text: "A filing a company must make within days of a major event, such as a new loan, a departing executive or a bankruptcy." },
];

export function lookup(text: string): GlossaryEntry | null {
  return GLOSSARY.find((g) => g.pattern.test(text)) ?? null;
}
