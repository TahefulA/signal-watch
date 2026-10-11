# Signal Watch

Enter a ticker. Signal Watch reads the company's latest 10-K, 10-Q and 8-K from SEC EDGAR, its recent headlines and
90 days of market data, and builds a sourced map of the entities that matter to its credit. Every box opens the exact
sentence it came from. Around the map:

- **Capital structure**: every debt instrument from the debt note, leverage, coverage and liquidity from XBRL, and the
  maturity profile from the filing's own table.
- **Change detection**: what the newest 10-Q or 10-K added or dropped compared with the previous quarter's filings.
- **Peer comparison**: shared and unique counterparties, common risk themes, side-by-side metrics and divergences.
- **Meeting prep**: a one-page brief with three things to know, the numbers, questions to ask and risks to watch.
- **Dashboard**: a watchlist with an alert when a company files after its last report.
- **Above the map**: a signal summary, a question bar that answers only from the report with clickable citations,
  the last-updated line and the validation record (how many proposed entities were verified, rejected or merged).
- **Beside the map**: a financial snapshot from XBRL (revenue, EBITDA and margin, free cash flow, current ratio, debt,
  liquidity, next final maturity) and the debt stack with its maturity wall.

## How it works

```
POST /api/analyze { ticker }            (streams newline-delimited JSON progress events)
  1. SEC EDGAR     latest 10-K, 10-Q, 8-K; Business, Risk Factors and MD&A sections; the debt notes
  2. Google News   10 recent headlines, ranked by publisher
  3. Yahoo Finance 90-day change vs the S&P 500, 52-week range, market cap
  4. SEC XBRL      cash, operating income, D&A and interest expense, trailing twelve months
  5. Gemini        entities with magnitude, trend, strategic context and a quote for each claim;
                   debt instruments from the debt notes (two calls in parallel)
  6. Verification  quotes must be found in the cited document; figures must appear in their quote
  7. Gemini        five-section memo; sentences with figures not in the facts are removed
  8. Tiger Data    report, entity nodes, typed relationship edges and debt instruments saved
POST /api/changes { reportId }          baseline from the filings before the newest 10-Q/10-K, then a diff
POST /api/peers   { reportId, peerReportIds }
POST /api/brief   { reportId, peerReportIds? }   printable at /brief/<id>
GET  /api/watchlist                     dashboard cards with new-filing alerts
```

### What keeps it honest

Gemini reads and classifies; it never supplies a number or a quote that is not in the source text.

- An entity, magnitude, trend, protection or debt instrument is kept only if its quote is found in the filing.
- A magnitude label survives only if every figure in it appears in its quote. Table amounts need a nearby
  "(in thousands)" heading, or a sentence stating the same amount in words.
- Analysis lines ("why it matters", the downside) are labeled as Gemini's reading; lines that add numbers or rank an
  entity ("largest", "primary") without a quote saying so are dropped.
- Change detection calls an entity new only if the earlier filings never mention it, and removed only if the current
  filings no longer do. Changes in Gemini's own ratings are listed separately and not marked on the map.
- Peer comparison searches the other company's filing text before calling an entity unique.
- Ratios are shown as "n/m" with the reason when EBITDA is negative. Total debt must reconcile with the filing's
  maturities table or the company's tagged XBRL debt; otherwise it reads "Not reconciled" and leverage is withheld.
- Qualified relationships (SOLE_SUPPLIER_OF, ANCHOR_TENANT_OF, MAJOR_CUSTOMER_OF, GUARANTEES) fall back to the plain
  label unless the quote uses the word; a competitor with no sentence saying it competes is rejected.
- Confidence is a label (high, medium, low) from the source type, whether the relationship is stated or inferred, and
  whether the quote names the entity. Duplicates merge within a type by key words or acronym, and merges are logged.
- Generated text (signal, memo, brief, answers) loses any sentence with a figure not in the report, or a ranking word
  such as largest, earliest or sole that the report's quotes do not use.
- Debt comes from the whole footnote: named instruments, subsidiary debt, and, for issuers that report only by category
  (large banks), each category row with its weighted average rate. Coupons, maturities and amounts the text leaves out
  are filled from the filing's inline XBRL and marked XBRL; a face amount tagged more than once (add-on tranches) is not
  used. The maturity wall comes from the note's table, then its sentences, then the company's tagged XBRL schedule.
  When a 10-Q has no debt note, the Capital tab says which filing the detail comes from.
- Credit ratings appear only when a filing or headline states them. There is no bond price feed, and the UI says so.

## Data model

Tiger Data stores a labeled property graph: `entities` is the node store (`node_label`, `properties` jsonb and flat
context columns) and `relationships` is the edge store with typed edges such as `CUSTOMER_OF`, `LENDS_TO`,
`GUARANTEES` and `REGULATES`, aligned with FIBO relationship terms. Also `reports`, `debt_instruments`, `changes`,
`peer_comparisons` and `watchlist`.

```bash
npx tsx --env-file=.env.local scripts/graph-query.ts CUSTOMER_OF   # customers across every company's latest report
```

## Running it

```bash
npm install
cp .env.example .env.local     # GEMINI_API_KEY is required; DATABASE_URL enables storage
npx tsx --env-file=.env.local scripts/migrate.ts
npm run dev
```

Command-line run: `npx tsx --env-file=.env.local scripts/analyze.ts WULF`

## Layout

- `app/api/*` streaming analysis, changes, peers, brief and watchlist endpoints; `app/brief/[id]` printable brief;
  `app/dashboard` watchlist
- `lib/analyze.ts` pipeline; `lib/edgar.ts`, `lib/xbrl.ts`, `lib/news.ts`, `lib/market.ts` sources
- `lib/extraction.ts`, `lib/quotes.ts`, `lib/citations.ts`, `lib/graph.ts` extraction and verification
- `lib/capital.ts`, `lib/changes.ts`, `lib/peers.ts`, `lib/brief.ts`, `lib/dashboard.ts` the analysis features
- `lib/memo.ts` memo drafting; `lib/layout.ts` map layout; `lib/tiger.ts` storage

The previous risk-score timeline version is tagged `v1-risk-timeline`.
