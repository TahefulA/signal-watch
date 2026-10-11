import type { TabKey } from "@/components/layout/tab-bar";

/**
 * The presentation tour: one stop per part of the app. Each stop says what is
 * on screen, why it is there (the reason, not the technology), and a line a
 * presenter can say out loud. PROJECT_GUIDE.txt Part 0.8 has the same script.
 */
export interface TourStep {
  title: string;
  /** Tab to open before showing the stop. */
  tab?: TabKey;
  /** CSS selector of the element to outline; none for a centered stop. */
  target?: string;
  look: string;
  why: string;
  say: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "The problem we are solving",
    look: "TeraWulf (WULF), a company building data centers for AI, which has borrowed about $5.7 billion.",
    why: "A lender's best case is getting paid back with interest; the worst case is losing most of the loan. Lenders lose money when they miss a warning sign buried in hundreds of pages of company reports. An analyst covers 50 to 70 companies and cannot read everything.",
    say: "Lenders don't lose money on the headline. They lose it on the footnote nobody had time to read. Signal Watch reads every footnote, for every company, in about a minute.",
  },
  {
    title: "The steps an analyst already follows",
    target: '[role="tablist"]',
    look: "Six tabs, each labeled with a step: qualitative analysis, profitability, capital structure, forecasting, valuation, recommendation.",
    why: "Credit analysts are trained on a standard seven-step process. We laid the app out in that order so a professional recognizes it at once and nothing feels new to learn. Each tab answers one question, in the order they would ask it.",
    say: "We didn't invent a new workflow. We automated the one credit analysts are already trained on, one step per tab.",
  },
  {
    title: "Who the company depends on",
    tab: "graph",
    target: ".react-flow",
    look: "The company in the middle. Around it: its customers, lenders, regulators and risks, each pulled from its official reports.",
    why: "A company's risk lives in its relationships: one customer paying most of the bills, a guarantee with conditions, a regulator that can freeze permits. A list hides that; a picture shows it at a glance. Color tells you the type, the left strip how serious it is.",
    say: "Before any number, you see who can hurt this borrower. Every box is a sentence from the company's own filing, and you can click through to it.",
  },
  {
    title: "The numbers, one hover away",
    tab: "graph",
    target: ".react-flow__node:has(.node-enter-central)",
    look: "Hover the company box: eight quarters of revenue, profit margin and cash appear beside it. Hover any other box for its figure, its terms and when it first appeared.",
    why: "The map shows relationships; the hover brings the money to them, so the picture is never just a diagram. Thicker lines carry more money, and debt due within two years is marked in red because that is when companies most often fail to pay.",
    say: "The map isn't decoration. Hover anything and it tells you how much money is involved and how that has changed over time.",
  },
  {
    title: "Time: is it getting better or worse?",
    tab: "graph",
    target: '[data-tour="time"]',
    look: "The last twelve quarterly reports along the top, and the market over the same period.",
    why: "Lending is about direction. The same risk means something very different if it appeared this quarter or has been there for three years. Every screen says which report and which quarter its numbers come from, so nobody mistakes old news for new.",
    say: "Every number on screen is dated. You always know which quarter you are looking at, and whether a risk is new.",
  },
  {
    title: "Can the business pay its debts?",
    tab: "financial",
    target: '[data-tour="charts"]',
    look: "Revenue, profit, cash flow, cash and short-term bills, quarter by quarter. Red bars are quarters that lost money or burned cash.",
    why: "A company repays debt from the cash it generates. These charts answer the first question any lender asks. Free cash flow is here because a company can grow sales while running out of money; for WULF the red bars make that impossible to miss.",
    say: "Revenue went up last quarter. Free cash flow was minus $992 million. That gap is the story a lender needs to see.",
  },
  {
    title: "What it owes, and when",
    tab: "capital",
    target: "#panel-capital",
    look: "Every loan and bond: how much, the interest rate, who gets paid first, and the year it is due.",
    why: "Companies rarely fail on an ordinary day; they fail when a large debt comes due and nobody will lend again. Knowing the amounts and dates, and who is repaid first if things go wrong, is the core of credit.",
    say: "This is the calendar of when the company has to find money, and who stands first in line if it can't.",
  },
  {
    title: "What changed since last quarter",
    tab: "changes",
    target: "#panel-changes",
    look: "New customers, lost customers, new debt, repaid debt and changed figures since the previous report.",
    why: "An analyst already knows the company from last quarter. What they need is the difference. This tab is that difference, so a three-hour reread becomes a five-minute review.",
    say: "Analysts don't need the whole story every quarter. They need what changed. That's this tab.",
  },
  {
    title: "Stronger or weaker than its peers?",
    tab: "peers",
    target: "#panel-peers",
    look: "Similar companies side by side: debt, earnings, cash and the customers and risks they share.",
    why: "A number means little alone. Debt of five times earnings is high in one industry and normal in another. Comparing with similar companies turns a number into a judgment, and shared customers show risk across a whole sector.",
    say: "Is this borrower the weakest in its group or the strongest? You can't tell from one company alone.",
  },
  {
    title: "The recommendation",
    tab: "memo",
    target: ".memo-column",
    look: "A short written memo: summary, thesis, key risks, what offsets them, and how the market sees it.",
    why: "The memo is what an analyst actually hands to the people who decide. Most tools stop at showing data; we produce the deliverable itself, and every name in it links back to its evidence.",
    say: "This is the actual work product. Not another dashboard: the memo the analyst would write, with every claim linked to its source.",
  },
  {
    title: "The Devil's Advocate: the case against",
    tab: "memo",
    target: ".counter-column",
    look: "Beside the memo, a critic that argues against it: the bottom line, each point and how strong it is, and what to watch.",
    why: "People look for evidence that agrees with what they already believe, and an AI that writes a confident memo makes that worse. Investment committees already ask one person to argue against every deal. We built that person in, so the case against is always on the table.",
    say: "Every AI tool agrees with you. Ours argues against its own memo, because the reasons a loan fails matter more than the reasons it succeeds.",
  },
  {
    title: "The full case, with proof and plain English",
    tab: "memo",
    target: "#devils-case",
    look: "Each point with what the memo said, the argument with dates and quarters, a plain-English version, why it matters to a lender, and the evidence tables.",
    why: "A warning nobody understands gets ignored, so every point is explained for someone with no finance background. A warning nobody can check gets dismissed, so every point shows its evidence. And it includes the best answer to itself, because a critic that only attacks is easy to wave away.",
    say: "It found that Google's guarantee only starts once the buildings are finished, so the riskiest period, construction, isn't covered. The memo, written from the same filings, said Stable.",
  },
  {
    title: "Both views, always visible",
    target: ".verdict-badge",
    look: "\"Memo: Stable · 7 concerns\" in the top bar, on every tab.",
    why: "Nobody should read the word Stable without also seeing how many strong objections exist. The two views travel together wherever the analyst goes.",
    say: "You can never see the memo's verdict without seeing the case against it right next to it.",
  },
  {
    title: "Where the risk sits on the map",
    tab: "graph",
    target: '[data-tour="counter"]',
    look: "Counter view turns the boxes the critic cites red and fades the rest.",
    why: "The objections are not abstract: they point at specific customers, lenders and guarantees. Showing them on the map connects the argument to the relationships behind it.",
    say: "One click and the map shows you exactly which relationships the case against is about.",
  },
  {
    title: "Proof, including our own mistakes",
    target: "footer",
    look: "\"17/20 verified · 3 rejected\": how many of the AI's findings passed our quote check, and how many we threw away.",
    why: "Finance professionals will not act on anything they cannot check. Every box links to its exact sentence, numbers come from the government's tagged data, and when something is not disclosed the app says so instead of guessing. Showing what we rejected is what makes the rest believable.",
    say: "We show our failures on purpose. Three findings didn't match the filing word for word, so we threw them out, and we tell you that.",
  },
  {
    title: "Every morning: who needs me today?",
    target: 'header a[href="/dashboard"]',
    look: "The watchlist: every company you follow, sorted into Act now, Review and Quiet, with the reason for each.",
    why: "An analyst follows dozens of companies. The real morning question is which one changed overnight and which to deal with first. Each company is placed by plain rules (running low on cash, a dangerous filing, debt due soon, the critic disagreeing with the memo) and the reason is always shown.",
    say: "This is the to-do list a credit analyst actually needs: which companies need me today, and exactly why.",
  },
  {
    title: "Private companies, and the takeaway",
    look: "Many borrowers file nothing publicly. The analyst can upload the company's own documents and still get the case against the deal, with nothing stored.",
    why: "Some of the most painful credit losses happen at private companies, where there are no public filings to read. The critic works on whatever documents the lender has.",
    say: "Signal Watch reads every report, shows who the borrower depends on and what it owes, writes the memo, argues against it with proof, and keeps watching. So the lender sees the warning signs before they lend, not after.",
  },
];
