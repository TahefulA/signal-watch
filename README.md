# Signal Watch

Enter a ticker. Signal Watch reads the company's latest 10-K, 10-Q and 8-K from SEC EDGAR, its recent headlines and
90 days of market data, extracts the entities that matter to its credit with Gemini, and draws them as a
box-and-line map. Every box opens the exact sentence it came from. A five-part credit memo sits underneath, with each
named entity linking back to its box.

## How it works

```
POST /api/analyze { ticker }            (streams newline-delimited JSON progress events)
  1. SEC EDGAR     latest 10-K, 10-Q, 8-K; Business, Risk Factors and MD&A sections (40k chars each)
  2. Google News   10 recent headlines, ranked by publisher
  3. Yahoo Finance 90-day change vs the S&P 500, 52-week range, market cap
  4. Gemini        entities, relationships, severity, and a supporting quote per entity
  5. Verification  each quote must be found in the document it cites, or the entity is dropped
  6. Layout        two-sided dagre layout: counterparties and capital left, risks and policy right
  7. Gemini        five-section memo; sentences with figures not in the source facts are removed
  8. Tiger Data    report and entities saved; repeat requests within 12 hours are served from the database
```

Gemini classifies and drafts; it never supplies a number or a quote that is not in the source text.

## Running it

```bash
npm install
cp .env.example .env.local     # GEMINI_API_KEY is required; DATABASE_URL enables caching
npx tsx --env-file=.env.local scripts/migrate.ts
npm run dev
```

Command-line run: `npx tsx --env-file=.env.local scripts/analyze.ts WULF`

## Layout

- `app/api/analyze/route.ts` streaming endpoint
- `lib/analyze.ts` pipeline; `lib/edgar.ts`, `lib/news.ts`, `lib/market.ts` sources
- `lib/extraction.ts`, `lib/quotes.ts`, `lib/graph.ts` extraction, receipt verification, graph
- `lib/memo.ts` memo drafting and figure checks; `lib/layout.ts` map layout
- `components/map`, `components/panel`, `components/memo` the three parts of the page

The previous risk-score timeline version is tagged `v1-risk-timeline`.
