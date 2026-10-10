# Demo

**Demo link (fixed WULF report with CIFR as peer):**
https://signal-watch-phi.vercel.app/?report=36e359a9-052f-4e17-8afc-b29d2403f4c1&peers=4a0a2c45-8add-4d9c-8ccf-70624b486754

**Dashboard:** https://signal-watch-phi.vercel.app/dashboard
**Printable brief:** https://signal-watch-phi.vercel.app/brief/36e359a9-052f-4e17-8afc-b29d2403f4c1

The demo report reads TeraWulf's 10-Q for Q2 2026 (filed Aug 5, 2026), its FY 2025 10-K and its Oct 5, 2026 8-K. The
change comparison uses the filings available on Aug 4, 2026. Every line below is on screen in that report.

## Before you go on

1. Open the demo link and wait for the peer section to fill in (a few seconds). Zoom the browser to 80-90%.
2. Open the dashboard and the printable brief in other tabs.
3. The demo link is saved, so nothing needs Gemini except the question bar. If the Wi-Fi is bad, skip step 3 below.

## The walkthrough (about 2.5 minutes)

| # | Do | Say |
|---|----|-----|
| 1 | Point at the **Signal** box at the top. | "Ten-second read. TeraWulf's story: about 401 megawatts leased to Anthropic and 378 to Fluidstack, Google's credit enhancement behind Fluidstack, $5.72 billion of debt against $2.62 billion of cash. Watch the Kentucky regulator's approvals." |
| 2 | Click **Who provides credit support for the leases?** under the question bar. | "Ask in plain English. It answers only from this report. Google, behind Fluidstack's leases. Each chip opens the filing line, page 54 of the 10-Q." Click the **Google** chip. |
| 3 | Close the panel. Point at the line under the legend, open **Details**. | "Seventeen of twenty entities Gemini proposed were verified against the filings. Three were rejected: Core Scientific, IREN and Cipher were called competitors, but the sentences cited only list stock moves. We don't trust the AI, we check it." |
| 4 | Point at the change panel. | "What changed since last quarter: Kentucky Power, the Kentucky Public Service Commission and Governor Hochul's Executive Order 62 appear in these filings and nowhere in the previous quarter's. The bridge facility is described as repaid." |
| 5 | Scroll to the map. Click **Anthropic**. | "Every box: type, the specific relationship, a figure, a confidence mark, and the filing with its fiscal period and page. Anthropic: a lease for approximately 401 megawatts. Revenue share: not disclosed, and we say so rather than guess." |
| 6 | Scroll the panel to *Connections*. Close it. | "Connections show who else sits next to it: Fluidstack and Core42 are the other tenants." |
| 7 | Point at **Financial snapshot** on the right. | "The numbers, from TeraWulf's own XBRL data: $165.2 million of revenue, EBITDA of negative $309.6 million, free cash flow of negative $2.50 billion. Leverage reads n/m, not a fake multiple. Ratings: not stated in the filings, and no bond price feed, so we don't invent them." |
| 8 | Scroll the right column to **Maturity wall**. | "The maturity wall, from the 10-Q's own table: $2.86 billion due in 2030." |
| 9 | Scroll to **Peer comparison**. | "Against Cipher Mining: both lease to Fluidstack, both have Google credit support, and both buy from Bitmain. Each match is checked against the other company's filing text." |
| 10 | Scroll to **Meeting prep**. | "And the one-page brief: three things to know, the numbers, risks with their filing lines, and questions such as what is drawn on the revolver and how Executive Order 62 affects the timeline." |
| 11 | Close. | "Signal Watch. Every box has a receipt, every number has a source, and where a number would mislead, it says so." |

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
