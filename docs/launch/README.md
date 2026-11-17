# Launch

Drafts for launch posts, and what is done and left. Every number in a post comes from `model/backtest.json` or `/ops`; update them from there on the day you post. Post user numbers only from `/ops` ("Who uses it"), never estimates.

## Before posting

| | Item | Status |
|---|---|---|
| 1 | Rotate the Gemini key, set a spend cap in Google AI Studio | **Owner** |
| 2 | Previews and local runs isolated from production data (`DB_SCHEMA`) | Done, #6 |
| 3 | Google sign-in | Built, #6. **Owner**: OAuth client + `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| 4 | Privacy, Terms, "not investment advice" on every report | Done, #6 |
| 5 | Daily watchlist email | Built, #10. **Owner**: domain, then Resend `RESEND_API_KEY` + `ALERT_FROM` |
| 6 | Shareable `/c/TICKER` pages with link previews, sitemap | Done, #8 |
| 7 | Hourly warm-up actually running | Fixed, #7 #9 (postmortem 2026-11-16) |
| 8 | Landing page with the track record | Done, #11 |
| 9 | Usage funnel on `/ops` (bots and owner excluded) | Done, #15 |
| 10 | Error log, `/api/health`, 30-minute uptime check | Done, #14 #18 |
| 11 | 30-company pipeline eval | Built, #17. **Owner**: repository secrets, then first run sets the baseline |
| 12 | Custom domain | **Owner**: buy one; then update `SITE_URL`, Vercel domain, Google redirect URI |
| 13 | Public changelog | Done, #16 |
| 14 | Daily AI budget (`DAILY_BUDGET_USD`, default $10) | Done, #13 |

Mark your own browser before testing in production: open any page with `?internal=1` once, so your visits are not counted.

## After posting

- Watch `/ops` and `/api/health` for the first 48 hours; raise `DAILY_BUDGET_USD` only if the funnel says people are getting value.
- Reply to every comment within the day. Bugs go into issues, fixes into PRs, and real incidents into `docs/postmortems/`.
- After a week, write down the real numbers from `/ops`: visitors, opened a report, watched a company, came back.
