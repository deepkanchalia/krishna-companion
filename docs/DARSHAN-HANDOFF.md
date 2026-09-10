# Darshan walk animation

Branch history: darshan foundation (merged as 7ae55ad), then the walk animation. This branch is the M1 darshan UI slice
plus the window and timer wiring it needs. It is not a claim that every M1 native
acceptance check has passed; the rows it does and does not claim are listed below.

## What the branch does

- The native companion window is hidden between darshans.
- The figure is a flipbook of frames from one generated video of a single Krishna
  painting: `assets/anim/{walkin,idle,teach,farewell}.webp` plus `manifest.js`
  (per-frame source rects and scene offsets). `src/sprite-player.js` plays them on a
  canvas; `src/renderer.js` maps darshan phases to segments. The three-line
  translation bubble reveals when the walk-in ends.
- While present the idle segment loops ping-pong at 8 fps (breathing, blinks, a
  slight head turn). The only frame loop is the sprite player's; it stops on absent,
  hidden tab, or reduced motion.
- Opening the purport plays the teaching gesture once, then idle. Withdrawal plays
  the farewell (raised palm, turn, walk out) and clears the canvas. A continuing (Next
  verse) darshan keeps the idle loop running.
- Reduced motion and a hidden tab show one eyes-open still (idle frame 6).
- Rebuilding the sheets: `scripts/anim/build-sheets.py <frames_dir> assets/anim --segments ...`
  after extracting frames from the source clip with ffmpeg; the clip prompt and segment
  bounds are recorded at the top of that script. Without `assets/anim/manifest.js` the
  renderer falls back to the single still and the CSS slide.
- Tap the translation or press Enter after engaging the card to expand the full
  translation and purport opening. Verbatim corpus strings are never rewritten.
- Next verse advances exactly one corpus entry and keeps the figure present.
- An untouched verse withdraws after 180 seconds following arrival. Expansion
  cancels that timeout; Next starts a new one.

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

- `docs/evidence/anim-walkin.png`: mid-stride entry at the right edge (preview, 1470×776).
- `docs/evidence/anim-present.png`: standing with the three-line card.
- `docs/evidence/anim-teach.png`: teaching-gesture frame rendered from the sheet.
- `docs/evidence/anim-farewell.png`: walking out to the right.
- `docs/evidence/anim-absent.png`: cleared after the farewell.
- `docs/evidence/darshan-walk.gif`: one full darshan recorded in the localhost preview.
- Native checks still owed: screen recording on the Electron window, frame trace during the walk-in, 5-minute CPU sample while absent, and a resident-memory number (the four decoded sheets hold roughly 66 MB while the app runs).
- Known polish, not done: a withdrawal that starts during the walk-in plays the farewell from the resting spot, so the figure jumps there first; a window hidden and shown again mid-farewell restarts the farewell from its first frame.

## Which M1 rows are claimed

Claimed by this branch, with automated or renderer evidence: the two-stage bubble
(M1.5), the walk-in, idle loop, teaching gesture, farewell, and withdrawal (M1.6), the absent and
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
