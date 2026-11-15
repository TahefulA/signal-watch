# Analyses failed when Gemini was rate-limited

- **Date:** 2026-11-11
- **Severity:** High
- **Detected by:** me, running several analyses in a row

## What users saw
"Analysis failed" on companies that had worked minutes before.

## Cause
Gemini returned 429 (per-model rate limit) and 503 (overloaded). The client retried the same model and gave up, and the route's time limit cut off slow retries.

## Fix
Commit `2d8cbda`:
- A 429 moves straight to the alternate model, because the limit is per model.
- A 503 backs off longer.
- A timeout goes to the faster fallback model.
- The analyze route gets the full 300 s.
- If the model service still fails, the last saved report for the ticker is served instead of an error.

## Prevention
- Retry policy depends on the status code, not one generic loop.
- Daily per-visitor limits on every Gemini route (2026-11-14) cap the load one person can create.
- Popular tickers are analyzed ahead of time by a weekly warm-up job, so most visits never call Gemini.

## Lessons
Plan for the provider to be unavailable: degrade to cached data rather than fail.
