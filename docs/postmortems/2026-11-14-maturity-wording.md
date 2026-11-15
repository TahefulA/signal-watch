# Summary showed "next debt due: 1220 days"

- **Date:** 2026-11-14
- **Severity:** Low
- **Detected by:** me, reviewing the live Summary tab

## What users saw
The plain-English summary said a loan was due in "1220 days", which is technically right but hard to read.

## Cause
The summary reused the analyst view's raw day count.

## Fix
Commit `0af3b36`: `inTime()` turns days into "in 45 days", "in about 8 months" or "in about 3.3 years".

## Prevention
Plain-English text for the general reader is formatted for that reader, not copied from analyst fields.
