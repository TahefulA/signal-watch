# LinkedIn draft

I shipped Signal Watch: type a US stock ticker and it estimates the chance the company files for bankruptcy in the next 12 months, from its SEC filings.

What I'm proudest of is the boring part:
• The number comes from a model I tested on 2015–2025 data it never saw: it flagged 361 of 606 real bankruptcies, a median 9 months early, with false alarms on 6% of healthy companies. The misses are published.
• The AI (Gemini) only reads and writes. Code checks every name and number it produces against the filings.
• Every AI call is logged with its cost and latency. An analysis costs about 9–17 cents.
• It runs like a small team's product: pull requests with CI and secret scanning, a 30-company eval for prompt changes, error tracking, uptime checks, and written postmortems, including one for a cron job that silently did nothing for a month.

Try it (free, not investment advice): https://signal-watch-phi.vercel.app
Code: https://github.com/TahefulA/signal-watch

Feedback very welcome, especially where it's wrong.
