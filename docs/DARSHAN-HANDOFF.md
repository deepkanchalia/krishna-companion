# Darshan glide and micro-motion

Branch: `codex/darshan-message-animation`. This branch is the M1 darshan UI slice
plus the window and timer wiring it needs. It is not a claim that every M1 native
acceptance check has passed; the rows it does and does not claim are listed below.

## What the branch does

- The native companion window is hidden between darshans.
- A single figure, `assets/krishna.png`, glides horizontally in from the right; the
  three-line translation bubble reveals after the arrival delay.
- While arriving or present, the image breathes on a 4-second ease-in-out scale
  from 1.000 to 1.012 and back. There is no JavaScript animation loop.
- On arrival the figure plays one 6 px ease-out settle over 400 ms. A continuing
  (Next verse) darshan keeps the figure in place and does not re-settle.
- Blink is not implemented. The parked heads atlas
  (`assets/candidates/rig/krishna-heads-realistic.png`) contains no closed-eyes
  frame, and its heads sit about 38 px off the shipped figure's eye line at
  rendered 1x size, far beyond the 1 px alignment tolerance, so no aligned blink
  overlay is possible.
- Tap the translation or press Enter after engaging the card to expand the full
  translation and purport opening. Verbatim corpus strings are never rewritten.
- Next verse advances exactly one corpus entry and keeps the figure present.
- An untouched verse withdraws after 180 seconds following arrival. Expansion
  cancels that timeout; Next starts a new one.
- Withdrawal glides right and the native window hides after the withdrawal delay.
- Reduced motion shows the fixed image with no breathing loop and no settle.

## Where the numbers live

`src/darshan.js` is the single source for every darshan timing: `ARRIVAL_MS`,
`WITHDRAWAL_MS`, `UNTOUCHED_MS`, `BREATH_MS`, `SETTLE_MS`, and `SETTLE_PX`.
`src/main.js` sends `{ arrivalMs, withdrawalMs, breathMs, settleMs, settlePx }` in
the `companion:show` payload. `src/renderer.js` writes them to the
`--arrival`, `--withdraw`, `--breath`, `--settle`, and `--settle-px` CSS custom
properties, and `src/styles.css` reads only those variables for the figure
animations. The localhost preview serves the same constants so no duration is
written twice.

`src/main.js` owns saved placement, the hidden-window lifecycle, focus gating,
readiness, verse progression, and native hiding. Opening uses `showInactive()` and
the window becomes focusable only after an explicit pointer engagement. The
renderer CSP keeps `connect-src 'none'`; source links are validated in the main
process against the corpus before `openExternal`.

## How to run the preview

The preview is a loopback-only browser harness around the real renderer and corpus.
It starts no Electron, requests no macOS permission, and writes no saved state.

```bash
node scripts/preview-darshan.js
# open http://127.0.0.1:4173
```

Use the controls to replay the arrival, expand the message, advance verses, and
switch entries, including the long and grouped ones.

## Evidence

`docs/evidence/` holds screenshots captured from the localhost preview at
1470×956, for entry 14.22-25 (the tallest combined text):

- `darshan-translation.png` — stage one, the three-line translation.
- `darshan-long-expanded.png` — stage two, the expanded reading.
- `darshan-withdrawn.png` — after withdrawal, the empty resting state.

Run `npm test` for the automated evidence; `test/micro-motion.test.js`,
`test/darshan.test.js`, `test/renderer.test.js`, and `test/darshan-main.test.js`
cover the timings, CSS variables, corpus verbatimness, and window wiring. Tests
never launch Electron or request a macOS permission. `npm pack --dry-run` shows
no rig candidates, experiments, preview tooling, evidence, or compiled helper.

## Which M1 rows are claimed

Claimed by this branch, with automated or renderer evidence: the two-stage bubble
(M1.5), the single-image arrival, breathing, and withdrawal (M1.6), the absent and
reduced-motion behaviour (M1.7), the 180-second untouched timeout (M1.8), and the
micro-motion row (UI5). The always-on criteria touched are display provenance
(C3), focus behaviour (C8), and network isolation (C10).

## Which M1 rows are not claimed

The native acceptance checks that need a human on macOS remain owed: native focus
return, saved-display placement, the first-launch stopwatch (M1.1), the arrival
performance trace, and the five-minute CPU sample and window-list absence (M1.7).
A short screen recording of one darshan is also owed as a manual check. Schedule
extensions (M1.2), typing deferral (M1.3), and the fullscreen guard (M1.4) are
outside this UI slice. No native performance or complete M1 acceptance claim is
made here.
