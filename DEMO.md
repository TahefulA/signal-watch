# Demo

**Demo link (fixed WULF report with CIFR as peer):**
https://signal-watch-phi.vercel.app/?report=170630ab-e2ce-4167-8802-18916fa99196&peers=e4b96626-37b1-4c6d-8589-1cf3300882b7

**Dashboard:** https://signal-watch-phi.vercel.app/dashboard
**Printable brief:** https://signal-watch-phi.vercel.app/brief/170630ab-e2ce-4167-8802-18916fa99196

The demo report reads TeraWulf's 10-Q (filed Aug 5, 2026), 10-K (Feb 27, 2026) and 8-K (Oct 5, 2026). Its change
comparison was built from the filings available on Aug 4, 2026: the 10-Q filed May 8, the 10-K and the 8-K filed Jul 6.
Every line below is on screen in that report.

## Before you go on

1. Open the dashboard in tab 1 and the demo link in tab 2. Wait for the peer section in tab 2 to fill in (a few seconds).
2. Zoom the browser to 80-90% so the map and the capital structure panel sit side by side.
3. Open the printable brief in tab 3 in case printing is asked about.

Everything in the demo link is saved, so it needs no Gemini call. If the Wi-Fi is bad, it still loads in a few seconds.

## The walkthrough (about 2 minutes)

| # | Do | Say |
|---|----|-----|
| 1 | Tab 1, the dashboard. | "This is the morning screen. Each company on the watchlist shows its debt, liquidity and EBITDA, and the card turns amber when the company files something we haven't read yet. We check EDGAR directly." |
| 2 | Click **Open map** on TeraWulf (or switch to tab 2). | "This is TeraWulf. Every box is an entity from its filings, and every box carries the page it came from." |
| 3 | Point at the change panel above the map. | "First, what changed since last quarter. Kentucky Power, the Kentucky Public Service Commission and New York's data center moratorium appear in these filings and nowhere in the previous quarter's. We only call something new after searching the earlier filings for it." |
| 4 | Click **Anthropic** on the map. | "Click any box. Anthropic: a lease for approximately 401 megawatts of critical IT load at the Justified campus, page 54 of the 10-Q. Evidence, magnitude, strategic context, and related nodes: Fluidstack and Core42 are the other tenants." |
| 5 | Click **Fluidstack** under Related nodes, scroll to *Comparison*. | "Fluidstack, 378 megawatts at Lake Mariner. And it is also Cipher Mining's tenant, at Barber Lake. That comes from Cipher's own filings." |
| 6 | Close the panel; point at **Capital structure** on the right. | "The full debt stack from the debt note: $5.72 billion of principal, matching the filing's own maturities table, 56% secured. EBITDA over the last twelve months was negative $309.6 million, so we show leverage as not meaningful rather than a misleading multiple. $2.86 billion comes due in 2030." |
| 7 | Scroll to **Peer comparison**. | "Side by side with Cipher. They share Fluidstack. Google backs Fluidstack's leases at TeraWulf, and Cipher's 10-Q carries a $544.5 million asset for the value of Google agreeing to make lease payments there too. Click Evidence to see that sentence. Morgan Stanley is the agent on both revolvers." |
| 8 | Scroll to **Meeting prep**. | "And the meeting brief, on one printable page. Three things to know, the numbers, risks with their filing lines, and questions to ask, like what's drawn on the revolver and how the New York permit pause affects the timeline." |
| 9 | Close. | "Signal Watch. Paste a ticker, get the map, the debt, what changed, the peers and the meeting brief, and every claim links to the filing line it came from." |

If there is time for a live run: type a ticker such as `IREN` in the Analyze page. It takes 20 to 40 seconds and
returns a new map, capital structure and memo. Then press **Compare with previous quarter**.

## The 60-second pitch

Credit analysts start every name the same way: pull the 10-K, the 10-Q and the latest 8-K, work out who the company
depends on, what it owes, what changed since last quarter and how it compares with peers, then write it up before the
meeting. Most of that is reading.

Signal Watch does the reading. It pulls the filings from SEC EDGAR, has Gemini extract every counterparty, lender,
regulator and risk, and keeps an entity only if its quote is found in the filing. It reads the debt note into a
capital structure, takes the company's own XBRL figures for leverage and coverage, compares the filings with last
quarter's, matches peers counterparty by counterparty, and writes a one-page meeting brief.

For TeraWulf, that surfaces a new Kentucky power agreement that needs state approval, New York's data center permit
pause, Google's credit support behind Fluidstack's leases, and the fact that Cipher Mining shares the same tenant.

Every number has a source. Where a number would mislead, such as leverage on negative EBITDA, we say so.

## Questions you may get

**How do you stop the AI from making things up?**
Gemini only proposes. Every entity, figure, protection and debt instrument must come with a quote, and we find that
quote in the filing before it is shown. A figure must appear in its own quote. Analysis sentences that add numbers, or
call something "the largest" without a quote saying so, are removed.

**How do you know something is new since last quarter?**
We rebuild the map from the filings available the day before the newest 10-Q, then search the earlier filings' text
for each entity. If the name appears anywhere before, it is not called new, even if it was not on the earlier map.
Changes in Gemini's own ratings are listed separately and never marked on the map.

**Where do the leverage numbers come from?**
Debt from the debt note, checked against the filing's maturities table. Cash, operating income, depreciation and
interest from the company's XBRL data on EDGAR, as trailing twelve months. The capital structure panel lists every
input with a link to the filing.

**Why is revenue concentration "Not disclosed"?**
Because neither filing states a tenant's share of revenue. We show a percentage only when the filing does.

**What's the data model?**
A labeled property graph in Tiger Data: entities are nodes with labels and properties, relationships are typed edges
such as CUSTOMER_OF, LENDS_TO, GUARANTEES and REGULATES, aligned with FIBO terms. One query lists every company's
customers across all reports.

**Does it work for other companies?**
Any company with recent 10-K and 10-Q filings. Results vary somewhat between runs because extraction is done fresh;
saved reports keep a given map fixed.

**What would you build next?**
Bond prices and spreads for real relative value, and earnings call transcripts.
