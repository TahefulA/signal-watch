# Signal Watch

A 90-day risk timeline for each company, built from SEC filings, Form 4 insider trades, news headlines and market
data. Every point on the line breaks down into four components, and every component links to the sentence or
filing that moved it.

## How it works

```
EDGAR (10-K, 10-Q, 8-K, Form 4) ─┐
Google News RSS (date-windowed) ─┼─> scripts/ingest.ts ─> fixtures/*.json ─┐
Yahoo Finance daily closes ──────┘          │                              ├─> Next.js app (reads only)
                                            └─> Tiger Data (TimescaleDB) ──┘
```

Ingestion runs offline. The app never calls EDGAR or Gemini on a page request, so pages are fast and stay within
serverless time limits.

### The score

A risk score from 0 to 100; **higher means more concern**. Each day uses only what was public on that day (filings
by filing date, Form 4s by filing date, headlines by publish date, closes up to that session).

| Component | Weight | Rules |
|---|---|---|
| Filing anomaly | 30% | First-time "material weakness" or "going concern" +30, first-time restatement +25, risk factor section grows >20% +15, management tone shift >30 points +20, new covenant language +15, liquidity language +10. Decays linearly over 90 days. |
| Insider activity | 25% | 3+ insiders selling within 7 days +40, CEO/CFO sells >50% of holdings +30, insider buys after a >10% monthly drop −20, insider selling above twice its 12-month pace +10. Decays over 30 days. |
| Sentiment divergence | 25% | Management tone (latest MD&A) bullish and news (14-day, credibility-weighted) bearish +50, the reverse +30, gap >40 points +20. |
| Market divergence | 20% | Stock trails its sector ETF by >10 points over 5 sessions +50, HYG/LQD ratio falls >1% +30, stock up >5% while HYG/LQD falls >0.5% +20. |

Each component is capped at 100.

**On credit spreads.** Company-level bond or CDS spreads are not available from free sources, so market divergence
uses the stock against its sector ETF, with the HYG/LQD price ratio as a read on the high-yield credit backdrop. It
is not a basis-point spread.

**Citations.** EDGAR filings are HTML without page numbers, so quotes cite the filing section (for example
"10-Q, Item 2. Management's Discussion and Analysis") and link to the document.

### Gemini

With `GEMINI_API_KEY` set, Gemini classifies MD&A tone and headline polarity, and writes the one-line reason on the
homepage. Without it, a deterministic word-list classifier is used. Gemini never produces numbers; any generated
sentence containing a figure that is not in the input facts is rejected and retried twice, then replaced with a
template.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in what you have; everything is optional
npm run dev
```

Refresh data:

```bash
npx tsx scripts/ingest.ts              # WULF, F, T -> fixtures/ and Tiger Data if configured
npx tsx scripts/migrate.ts             # once, to create the Tiger Data schema
npx tsx scripts/backtest.ts            # 20-ticker backtest -> data/backtest.json
```

## Layout

- `app/` pages and API routes (`/api/signals`, `/api/signal/[ticker]`, `/api/events/[ticker]`, `/api/backtest`)
- `components/ticker/` timeline chart, decomposition panel, source drawer
- `lib/edgar.ts`, `lib/news.ts`, `lib/market.ts`, `lib/gemini.ts` data sources
- `lib/signals/` one module per score component; `lib/scoring.ts` combines them
- `lib/pipeline.ts` builds a point-in-time dataset for one ticker
- `lib/tiger.ts` Tiger Data schema, writes and reads
