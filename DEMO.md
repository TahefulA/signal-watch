# Demo

**Demo link (fixed WULF report with CIFR as peer):**
https://signal-watch-phi.vercel.app/?report=36e359a9-052f-4e17-8afc-b29d2403f4c1&peers=4a0a2c45-8add-4d9c-8ccf-70624b486754

**Dashboard:** https://signal-watch-phi.vercel.app/dashboard
**Printable brief:** https://signal-watch-phi.vercel.app/brief/36e359a9-052f-4e17-8afc-b29d2403f4c1

The demo report reads TeraWulf's 10-Q for Q2 2026 (filed Aug 5, 2026), its FY 2025 10-K and its Oct 5, 2026 8-K. The
change comparison uses the filings available on Aug 4, 2026. Every line below is on screen in that report.

## Before you go on

1. Open the demo link and wait a few seconds for the Peers tab badge to read CIFR. Zoom the browser to 80-90%.
2. Open the dashboard and the printable brief in other tabs.
3. The demo link is saved, so nothing needs Gemini except the question bar. If the Wi-Fi is bad, skip step 3 below.

## The walkthrough (about 2.5 minutes)

The page opens on **Overview**. The header above the tabs stays put: price and 90-day move, market cap, debt, liquidity,
next maturity, rating.

| # | Do | Say |
|---|----|-----|
| 1 | Point at the header, then the **Signal**. | "One company, one screen. TeraWulf: down 34% in 90 days, $5.72 billion of debt. The signal: about 401 megawatts leased to Anthropic and 378 to Fluidstack, Google's credit enhancement behind Fluidstack, and the Kentucky regulator to watch." |
| 2 | Point at the two rows of tiles. | "The numbers that decide the credit. EBITDA is negative, so leverage reads n/m rather than a fake multiple. What we derive: liquidity runway up to 14 months at the current cash burn, market loan-to-value 31% (the equity cushion under the debt), and $237 million due through 2027." |
| 3 | Click **Who provides credit support for the leases?** | "Ask in plain English; it answers only from this report. Google, behind Fluidstack's leases, with the filing line as a chip." |
| 4 | Point at the four cards below. | "Who the cash flows depend on, what could go wrong, what changed since last quarter, and how much to trust it: 17 of 20 proposed entities verified, three rejected." |
| 5 | Click **Anthropic** in the first card. | "Every row opens its evidence: the quote, page 54 of the 10-Q, the confidence and the connections." Close the panel. |
| 6 | Open the **Map** tab. Hover **Google**, then **Table**, then **Export CSV with quotes**. | "The same entities as a map: hover one and everything unrelated fades. Or as a table, exported with every quote for the credit file." |
| 7 | Open **Financials**. | "Metrics with reference bands and Cipher marked beside them; the debt stack and maturity wall from the 10-Q's own table, $2.86 billion due in 2030; and the market's view, with the 52-week range and enterprise value." |
| 8 | Open **Changes**. | "Kentucky Power, the Kentucky PSC and Executive Order 62 are new this quarter; the bridge facility is described as repaid. A name counts as new only if the earlier filings never mention it." |
| 9 | Open **Peers**. | "Against Cipher: both lease to Fluidstack, both have Google credit support, both buy from Bitmain, each checked against the other company's filings." |
| 10 | Open **Brief**. Point at **Pages to have open** and **Copy as text**. | "The meeting brief: three things to know, risks with their filing lines, questions to ask, the pages to have open, and a copy button for the meeting notes." |
| 11 | Open **Sources**. | "And the audit trail: every document read, every rejection with its reason, and the rules. Every box has a receipt." |

Live run if time allows: type `IREN` or `CIFR` and press Analyze (20 to 40 seconds).

## The 60-second pitch

Credit analysts at funds like Diameter start every name the same way: pull the 10-K, the 10-Q and the latest 8-K, work
out who the company depends on, what it owes, what changed since last quarter and how it compares with peers.

Signal Watch does the reading. Paste a ticker. Gemini proposes every counterparty, regulator, risk and debt instrument;
we keep one only if its quote is in the filing, and only call something a sole supplier, an anchor tenant or a
competitor if the sentence says so. Each box carries a confidence label and the filing's page and fiscal period.

Around the map: a signal summary, a financial snapshot from the company's own XBRL data, the debt stack and maturity
wall from the debt note, what changed since last quarter, peers matched counterparty by counterparty, a one-page
meeting brief, and a question bar that answers only from the report.

For TeraWulf that surfaces Google's credit support behind Fluidstack, a new Kentucky power agreement awaiting state
approval, New York's data center permit pause, and the fact that Cipher Mining shares the same tenant. Every claim has a
receipt.

## Questions you may get

**How do you prevent hallucination?**
Every quote is searched for in the cited filing; if it isn't there, the entity is rejected and listed under Details.
Every figure on a box must appear in its own quote. Generated sentences that use a number not in the report, or call
something the largest, earliest or sole without a quote saying so, are removed. Qualified relationships fall back to
the plain label unless the sentence uses the word.

**What does the confidence mark mean?**
A label, not a score. High: stated in a filing sentence that names the entity. Medium: stated in a filing but inferred,
or only in a headline. Low: inferred from a headline.

**How do you know something is new since last quarter?**
We rebuild the map from the filings available before the newest 10-Q and search the earlier filings' text. A name that
appears anywhere before is not called new. Figures are compared only when both quotes describe the same named thing.

**Where is the credit rating?**
We show a rating only when a filing or headline states it, with that sentence. We don't license rating agency data, and
we don't make one up.

**Why does Ford show total debt as "Not reconciled"?**
Ford tags its debt with custom XBRL names and has no maturities table we can read, so we can't confirm the instruments
we found are complete. Leverage on a partial list would mislead, so it is withheld.

**What's the data model?**
A labeled property graph in Tiger Data: entities are nodes with labels and properties, relationships are typed edges
(CUSTOMER_OF, PROVIDES_CREDIT_SUPPORT_TO, REGULATED_BY...) aligned with FIBO terms. Rejected entities, merges, changes,
peer comparisons and financial snapshots are stored too.

**What would you build next?**
A bond price and spread feed for relative value, licensed ratings, and earnings call transcripts.
