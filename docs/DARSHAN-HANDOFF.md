# Darshan walk animation

Branch history: darshan foundation (merged as 7ae55ad), then the walk animation. This branch is the M1 darshan UI slice
plus the window and timer wiring it needs. It is not a claim that every M1 native
acceptance check has passed; the rows it does and does not claim are listed below.

## What the branch does

- The native companion window is hidden between darshans.
- The figure is a flipbook of frames from one generated video per style: six styles
  (realistic, cartoon, painterly, gyan, warrior, pixel) under
  `assets/anim/<style>/{walkin,idle,teach,farewell}.webp`, each with a `manifest.json`
  (per-frame source rects and scene offsets, and the clip bounds each segment was cut
  from under `source`), assembled into one `manifest.js` (`KRISHNA_ANIM_STYLES` plus the
  default). The style is `settings.figure.style`, chosen from the tray Figure menu or
  `krshna style <name>`; the list lives once in `src/config.js`. `src/sprite-player.js`
  plays the frames on a canvas; `src/renderer.js` maps darshan phases to segments and
  switches styles on the spot. The three-line translation bubble reveals when the
  walk-in ends.
- While present the idle segment loops ping-pong at 8 fps (breathing, blinks, a
  slight head turn). The only frame loop is the sprite player's; it stops on absent,
  hidden tab, or reduced motion.
- Opening the purport plays the teaching gesture once, then idle. Withdrawal plays
  the farewell (raised palm, turn, walk out) and clears the canvas. A continuing (Next
  verse) darshan keeps the idle loop running.
- Reduced motion and a hidden tab show one eyes-open still (idle frame 6).
- The card is Krishna's thought: two bubbles trail from its edge to his head, it wears
  an opaque charcoal glass, and a soft, uneven golden light drifts slowly behind his head
  and shoulders while the figure itself carries a warm glow.
- Clip record. Every style except `pixel` comes from one 15 s image-to-video generation
  (minimax-h3, 1344x768, 24 fps, green background requested; the painterly clip ignored
  it and was matted with rembg) of a single Krishna figure walking in from the right,
  standing and breathing, raising a teaching hand, and leaving with a farewell palm; the
  prompts differ only in the style words and, for gyan and warrior, the Mahabharat-era
  lean and powerful build. Segment bounds (seconds, fps) are in each style's
  `manifest.json` under `source`. `pixel` is derived from the warrior sheets by
  `scripts/anim/pixelate-style.py --factor 3 --colors 24 --line 0.85 --edge 48`.
- Rebuilding the sheets: extract frames with `ffmpeg -i clip.mp4 -vsync 0 frames/f%04d.png`,
  `scripts/anim/analyze-clip.py` to find segment bounds, then
  `scripts/anim/build-sheets.py <frames_dir> assets/anim/<style> --prefix <style>/ [--matte rembg] --segments ...`,
  then `scripts/anim/assemble-manifest.py assets/anim realistic`. Without
  `assets/anim/manifest.js` the renderer falls back to the single still and the CSS slide.
- Tap the translation or press Enter after engaging the card to expand the full
  translation and purport opening. Verbatim corpus strings are never rewritten.
- Next verse advances exactly one corpus entry and keeps the figure present.
- An untouched verse withdraws after 180 seconds following arrival. Expansion
  cancels that timeout; Next starts a new one.

## Where the numbers live

Two files hold the numbers. `assets/anim/manifest.js` holds every style's segment
lengths (walk-ins from 1583 to 3000 ms, farewells up to 3833 ms, idle and teach frame
counts and rates). `src/darshan.js` holds the bounds and the fallback values:
`ARRIVAL_MS` 3200 and `WITHDRAWAL_MS` 4000 (upper bounds over every style's two
segments, used by the untouched timer and the native hide; the renderer fades the halo
and caption over the selected style's own lengths), `UNTOUCHED_MS`, and the
`BREATH_MS`, `SETTLE_MS`, `SETTLE_PX` used only by the CSS fallback when no manifest
is present. `src/main.js` sends `{ arrivalMs, withdrawalMs, breathMs, settleMs,
settlePx }` in the `companion:show` payload; `src/renderer.js` writes them to the
`--arrival`, `--withdraw`, `--breath`, `--settle`, and `--settle-px` CSS custom
properties, which the fallback animations and the halo/caption fades read. The
localhost preview serves the same constants.

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
- A GIF of one full darshan was recorded in the localhost preview and attached to the pull request discussion rather than committed (3 MB of history).
- Native checks still owed: screen recording on the Electron window, frame trace during the walk-in, 5-minute CPU sample while absent, and a resident-memory number (the selected style's four decoded sheets hold 64 to 81 MiB depending on the style; switching styles releases the previous set).
- Known polish, not done: a withdrawal that starts during the walk-in plays the farewell from the resting spot, so the figure jumps there first; a window hidden and shown again during a one-shot segment (walk-in, gesture, farewell) restarts that segment from its first frame; a walk-in that exceeds the 3.2 s bound only happens if a sheet had to decode on demand (a load that never completes gives up after 8 s).

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
