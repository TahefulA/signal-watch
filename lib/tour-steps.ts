import type { TabKey } from "@/components/layout/tab-bar";

/**
 * The presentation tour: one stop per part of the app. Each stop says what is
 * on screen, the credit fund's problem it answers, why it is there (the
 * reason, not the technology), and a line a presenter can say out loud. PROJECT_GUIDE.txt Part 0.8 has the same script.
 */
export interface TourStep {
  title: string;
  /** Tab to open before showing the stop. */
  tab?: TabKey;
  /** CSS selector of the element to outline; none for a centered stop. */
  target?: string;
  look: string;
  /** The credit fund's problem this part answers. */
  problem?: string;
  why: string;
  say: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "The problem",
    look: "TeraWulf (WULF), which has borrowed about $5.7 billion to build data centers for AI.",
    problem: "An analyst covers 50 to 70 borrowers and cannot read every footnote. Most AI tools that claim to predict mostly remember the past.",
    why: "Lenders lose money on the warning nobody had time to read. Signal Watch reads the filings, puts a probability on trouble, and shows that probability's track record.",
    say: "Everyone is building AI that guesses prices. We built a credit forecaster that only uses what was knowable at the time, and proves it warned before real blowups.",
  },
  {
    title: "One number first: the chance of bankruptcy",
    tab: "committee",
    target: '[data-tour="tiles"]',
    look: "The 12-month bankruptcy probability, Altman Z'', leverage, coverage, liquidity and when the cash runs out, across the top.",
    problem: "Funds think in odds, because odds are what you compare against a price.",
    why: "The probability comes from gradient-boosted trees trained on every bankruptcy 8-K since 2012, scored from figures filed before today. Code computes it; the AI never does.",
    say: "WULF has a 3.6% chance of filing in the next year, more than four times the average, and every figure behind it was public before today.",
  },
  {
    title: "The committee argues over it",
    tab: "committee",
    target: '[data-tour="debate"]',
    look: "The Analyst defends the credit, the Devil's Advocate attacks it, and every line flips from Checking to Verified or Struck.",
    problem: "Conviction bias: once a memo says yes, the evidence against it gets explained away.",
    why: "Each agent may only cite evidence cards our code built from the filings. A referee written in code forces every point to be rebutted or conceded, and the verifier strikes any line with a number that is not on its card.",
    say: "The AI argues; it never decides. Watch the verifier strike a line that made up a number.",
  },
  {
    title: "Prediction markets, applied to one borrower",
    tab: "committee",
    target: '[data-tour="rates"]',
    look: "Kalshi's odds for the next Fed meetings, the extra interest on floating-rate debt, and how much sooner the cash runs out.",
    problem: "Markets reprice rates daily; a credit file is updated quarterly.",
    why: "The contract prices become a rate distribution, and code applies it to the floating debt in the debt note and reruns the cash forecast. Thin quotes are skipped and the gap is shown.",
    say: "When the Fed odds move overnight, the radar shows which of your borrowers it hits, and by how much.",
  },
  {
    title: "The proof",
    look: "The Proof page (top right): calibration, ranking accuracy against Altman Z'' year by year, months of warning, and the leakage audit.",
    problem: "A finance team trusts a backtest more than any feature.",
    why: "Tested on 2015 to 2025, each year scored by a model trained only on earlier years: AUC 0.86 against 0.72 for Altman Z'', 361 of 606 bankruptcies flagged a median of 9 months early, and zero figures from the future.",
    say: "Hughes Satellite Systems, an EchoStar subsidiary, filed in August 2026. The model had it flagged almost two years earlier.",
  },
];
