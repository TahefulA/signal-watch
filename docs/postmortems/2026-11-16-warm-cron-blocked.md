# Hourly warm-up never reached the analyze route

- **Date:** 2026-11-16 (found); broken since at least 2026-10-11
- **Severity:** Medium
- **Detected by:** me, while counting how many tickers had saved reports before launch

## What users saw

Demo tickers that should open instantly were weeks old (TSLA, IREN: 2026-10-11; NVDA: 2026-10-30), and ALIT, ADT and BMBL had never been analysed, so a visitor clicking them waited about a minute for a fresh run. Only 12 tickers had a saved report at all. Nothing on the site or in the logs said the warm-up was failing.

## Cause

The cron calls `/api/warm`, which calls `/api/analyze` over HTTP so it does the same work a visitor would. It built that URL from `request.url`, which is the deployment's own `*.vercel.app` address. Those addresses sit behind Vercel Authentication, so every call got a `302` to a login page. The warm route then read the HTML as "no result" and returned `200` with "Gemini unavailable; saved report kept", so the cron looked healthy.

Checked: `POST https://signal-watch-<id>.vercel.app/api/analyze` → `302`; the same request to `signal-watch-phi.vercel.app` → `200`.

## Fix

- In production the warm route calls `https://$VERCEL_PROJECT_PRODUCTION_URL` instead of the request's own host.
- It sets `redirect: "manual"` and returns `502` with the status and host when the answer is not the analyze stream, so a broken warm-up is a failed cron run, not a quiet success.
- Run locally after the fix: `{"step":"analyze","ticker":"AAPL","refreshed":true}`.

## Prevention

- A failure that looks like "the model was busy" must not be the default branch: unknown responses are errors.
- The warm-up now also keeps tickers on real users' watchlists under three days old, so its health shows up directly in what users open.
- To do: an uptime check that alerts when the newest demo report is over a day old.

## Update, same day

The first production run after the fix analysed ALIT twice, 14 seconds apart: two warm-up invocations overlapped, both found ALIT stalest and both paid for a full analysis (traces `289ca37e…` and `c07252d9…`). A `leases` row (`takeLease("warm", 300)`) now lets only one warm-up run at a time; the other returns `skipped`.

## Lessons

A fallback message ("saved report kept") hid a hard failure for over a month. Fallbacks should log why they fired.
