# Postmortems

One file per real incident: what users saw, the cause, the fix, and what stops it happening again. Blameless, short, dated.
Copy `TEMPLATE.md` to `YYYY-MM-DD-short-name.md`.

| Date | Incident | Severity |
|---|---|---|
| 2026-10-10 | [Gemini output truncated on large filings](2026-10-10-truncated-extraction.md) | Medium |
| 2026-11-11 | [Analyses failed when Gemini was rate-limited](2026-11-11-gemini-rate-limits.md) | High |
| 2026-11-11 | [Gemini API key exposed outside the repo](2026-11-11-exposed-api-key.md) | High |
| 2026-11-14 | [Any visitor could edit the shared watchlist](2026-11-14-shared-watchlist.md) | High |
| 2026-11-14 | [Schema migration deadlocked against the running app](2026-11-14-migration-deadlock.md) | Low |
| 2026-11-14 | [Summary showed "next debt due: 1220 days"](2026-11-14-maturity-wording.md) | Low |
| 2026-11-16 | [Hourly warm-up never reached the analyze route](2026-11-16-warm-cron-blocked.md) | Medium |
