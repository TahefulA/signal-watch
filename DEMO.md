# Demo

**Demo link (fixed WULF report):** https://signal-watch-phi.vercel.app/?report=c6648837-c77a-47ad-8eac-3376cb4699ba

This link always opens the same map and memo, generated from TeraWulf's 10-Q (Aug 5, 2026), 10-K (Feb 27, 2026),
8-K (Oct 5, 2026), ten headlines and 90 days of prices. Every quote below is on that map.

## Before you go on

1. Open the demo link in one tab. Confirm the map shows 12 boxes and the memo has five cards.
2. Open https://signal-watch-phi.vercel.app in a second tab for the live run.
3. Zoom the browser to 90% so the whole map fits on a projector.

If the venue Wi-Fi is slow or Gemini is overloaded, skip the live run and present from the first tab. Nothing on
that page needs a network call after it loads.

## The 30-second walkthrough

| # | Do | Say |
|---|----|-----|
| 1 | Second tab. Type `WULF`, press Analyze. | "This is Signal Watch. Paste a ticker and it reads the company's latest 10-K, 10-Q and 8-K, its recent news and its price history." |
| 2 | Point at the status line as it steps through. | "It pulls the filings straight from SEC EDGAR, then Gemini extracts every counterparty, financing, regulator and risk." |
| 3 | Map appears (about 15 seconds; if it runs long, switch to the first tab). | "TeraWulf is in the middle. Tenants and financing on the left, campuses and regulators on the right. Border color is the type, the strip on the left edge is severity." |
| 4 | Click **Google**. | "Google isn't a tenant. It provides the credit support behind Fluidstack's lease payments. Here's the exact sentence from the 10-Q, and the link opens the filing on EDGAR." |
| 5 | In the panel, click **Fluidstack** under *Linked on the map*. | "Fluidstack is the tenant it backs: 378 megawatts at Lake Mariner, the majority of the campus's remaining contracted capacity." |
| 6 | Click **NY Executive Order No. 62** on the right. | "And this is the risk most people would miss: in July New York paused certain permits for covered data center projects while it writes new rules. It's in the risk factors, not the headlines." |
| 7 | Scroll to the memo. Click the underlined **Kentucky Public Service Commission** in *Key risks*. | "Underneath is a five-part credit memo. Every entity it names links back to its box and its source." |
| 8 | Close. | "Paste a ticker, get a sourced map and a memo. Every box has a receipt." |

## The 60-second pitch

Credit analysts at funds like Diameter start every name the same way: pull the 10-K, the 10-Q, the latest 8-K and the
news, then work out who the company depends on and what could break. That map lives in their head or in a notes file,
and the citations get lost along the way.

Signal Watch builds that map in under a minute. Paste a ticker. It reads the filings from SEC EDGAR, extracts every
counterparty, financing, regulator and risk with Gemini, and draws them as a map. Every box opens the exact sentence it
came from, and if the sentence isn't in the filing, the box doesn't appear.

Below the map is a short credit memo: summary, thesis, risks, mitigants and relative value. Every company it names
links back to its box, and every number in it comes from the filings or the price data.

For TeraWulf, that surfaces the Google credit support behind Fluidstack's leases, a new 401-megawatt Anthropic lease, and a
New York permitting pause that sits in the risk factors, not the headlines.

Paste a ticker. Get a sourced map and a memo.

## Questions you may get

**How do you stop the AI from making things up?**
Gemini only proposes entities. Each one has to come with a quote, and we search the cited filing for that quote before
the box is drawn. If it isn't there, the box is dropped. In the memo, any sentence containing a number that isn't in the
filings or the market data is removed.

**Where does the data come from?**
SEC EDGAR for filings, Google News RSS for headlines, Yahoo Finance for prices. All free and public. Reports are saved
in Tiger Data so a repeat lookup is instant.

**Why is relative value so thin?**
Bond spreads and peer credit metrics aren't available from free sources, so the memo only uses what we can cite: the
stock against the S&P 500, the 52-week range and market cap. Plugging in a spread feed is the obvious next step.

**Does it work for other companies?**
Yes, any company with recent 10-K and 10-Q filings. Ford, for example, returns Novelis, the BlueOval SK battery joint
venture, its Department of Energy loan and Ford Credit. Results vary somewhat between runs because extraction is done
fresh each time; saved reports keep a given map fixed.

**How is this different from Bloomberg?**
Bloomberg gives you the data. This gives you the structure of a company's dependencies and risks, with the source
sentence for each one, in the time it takes to read a headline.

**What would you build next?**
Comparing two filings to show what changed since last quarter, and a spread feed for real relative value.
