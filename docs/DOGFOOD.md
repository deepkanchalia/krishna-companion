# Dogfood log

One line per darshan that was wrong, badly timed, or missing. Reviewed before every milestone; each entry either becomes a criterion in `docs/SUCCESS-CRITERIA.md`, a fix, or an explicit "won't fix" with the reason.

The app has run daily on the owner's MacBook Air (macOS 14.6, Apple silicon) since 2026-09-04. The rows below came out of that daily use and are all fixed.

Severity: `S1` broke the work session or showed wrong text, `S2` badly timed or visually wrong, `S3` polish.

| Date | Verse | What happened | What should have happened | Criterion | Severity | Outcome |
|------|-------|---------------|---------------------------|-----------|----------|---------|
| 2026-09-06 | any | The Claude Code hook was duplicated in settings on an upgrade, so a prompt could match twice | Install is idempotent: an upgrade leaves one hook entry | C12 | S2 | fixed in PR #5 |
| 2026-09-09 | any | The card read as a plain box, not a thought | The card reads as Krishna's thought, with bubbles trailing to his head | UI1 | S2 | fixed in PR #8 |
| 2026-09-09 | any | The pixel figure read as a blur | The pixel figure reads as clean pixel art, drawn with smoothing off | UI1 | S2 | fixed in PR #8 |
| 2026-09-09 | any | The halo read as concentric circles behind the head | The halo reads as one soft, uneven golden light | UI1 | S2 | fixed in PR #8 |
| 2026-09-10 | any | A forced show during a farewell arrived in the previous figure | A show waits out the farewell, then arrives in the current figure | UI5 | S2 | fixed in PR #8 review |
