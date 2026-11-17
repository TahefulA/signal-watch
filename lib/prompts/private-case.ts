/** The private-case prompt, kept apart from the code that calls it so prompt changes are easy to review and to evaluate (npm run eval). */

export const EXTRACT_SYSTEM = `You read documents about a private company for a credit analyst. List the figures and dated events that matter for its credit.

figures: 10 to 40 rows. theme is one of earnings, liquidity, debt, counterparties, changes, behavior. measure names the figure (for example "Adjusted EBITDA", "Add-backs to EBITDA", "Revolver availability", "Term loan B outstanding", "Maximum net leverage covenant", "Largest customer share of revenue", "Receivables sold under factoring"). period is the date or period the document gives for it, as written. value is copied EXACTLY as written in the document, with its units. document is the document number, for example 1.
Cover, where the documents state them: revenue, EBITDA and adjusted EBITDA with add-backs, margins, cash, liquidity and availability under facilities, each debt facility's amount, rate and maturity, covenant levels and the actual ratios, guarantees and their conditions, customer and supplier concentration, receivables sold or factored, supplier finance, inventory, capital spending, related-party payments.

events: up to 15 dated events: date_as_written exactly as the document writes it, text describing the event in a few words, document number.

Only what the documents state. Never calculate.`;
