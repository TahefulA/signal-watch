# Show HN draft

**Title:** Show HN: Signal Watch – bankruptcy odds for any US-listed company, from its SEC filings

**Text:**

I built Signal Watch to answer one question: could this company go broke in the next year?

Type a ticker and it reads the company's 10-K, 10-Q and 8-K filings from EDGAR, scores a 12-month bankruptcy probability, and explains it in plain English: what worries the model, what is in the company's favour, when its next debt comes due, and how much cash it can reach.

The number is not from an LLM. It is a gradient-boosted tree on 13 figures from XBRL filings, trained on 13,868 filers including 783 that went bankrupt, and tested out of sample on 2015–2025 using only figures filed before each date. In that test it flagged 361 of 606 bankruptcies ahead of time (a median of 9 months before the filing), ranked risk better than the Altman Z-score in all 11 test years (AUC 0.86 vs 0.72), and set off a false alarm on 6% of healthy company-quarters. The misses are on the track record page.

Gemini does the reading: it pulls lenders, counterparties and risks out of the filings into a map, writes a memo, and runs a debate between an analyst and a devil's advocate. Code checks every name against the filing text and every number against the facts it was given, and drops what does not match.

Engineering notes, since this is HN:
- Every Gemini call is logged with tokens, latency, cost and a hash of its prompt. A fresh analysis costs about $0.09–0.17 at list price; the live numbers are at /ops.
- A 30-company eval runs the whole pipeline against known facts on prompt changes.
- Postmortems are in the repo, including a cron that silently did nothing for a month.

It is free, with daily limits (or bring your own Gemini key). Not investment advice.

https://signal-watch-phi.vercel.app
Code: https://github.com/TahefulA/signal-watch

I'd love feedback on where the explanations confuse you, and on companies where you think it's plainly wrong.
