# Darshan animation

How the figure moves: the flipbook, where the timings live, and how to rebuild
the sheets.

## What it is

The figure is a flipbook. Each style is a set of frames cut from one generated
video and played on a canvas. There is no cut-out rig and no rotated parts.

- Six styles ship under `assets/anim/<style>/{walkin,idle,teach,farewell}.webp`:
  realistic (the default), cartoon, painterly, gyan, warrior, and pixel. Each
  style also carries a `manifest.json` with per-frame source rects, scene
  offsets, and the clip bounds each segment was cut from (under `source`). The
  six per-style manifests are assembled into one `assets/anim/manifest.js`
  (`window.KRISHNA_ANIM_STYLES` plus the default name).
- The style is `settings.figure.style`, chosen from the tray Figure menu or
  `krshna style <name>`. The list of styles lives once in `src/config.js`.
- `src/sprite-player.js` plays the frames on a canvas. `src/renderer.js` maps
  darshan phases to segments and switches styles on the spot, even while the
  figure is present.
- Phases: the walk-in plays once at 12 fps, then the idle segment loops
  ping-pong at 8 fps (breathing, blinks, a slight head turn). Opening the
  purport plays the teaching gesture once at 10 fps, then returns to idle.
  Withdrawal plays the farewell (raised palm, turn, walk out) at 12 fps, then
  clears the canvas.
- The three-line translation bubble reveals when the walk-in ends. The card is
  Krishna's thought: two bubbles trail from its edge to his head, it wears an
  opaque charcoal glass, and a soft, uneven golden light drifts behind his head
  and shoulders while the figure carries a warm glow.
- Reduced motion and a hidden tab show one eyes-open still (idle frame 6) and
  run no loop. The only frame loop is the sprite player's, and it stops on
  absent, hidden tab, or reduced motion.
- Without `assets/anim/manifest.js` the renderer falls back to the single still
  and the CSS slide.

## Where the numbers live

Two files hold the numbers.

`assets/anim/manifest.js` holds every style's segment lengths: walk-ins run 1583
to 3000 ms, farewells up to 3833 ms, with the idle and teach frame counts and
rates.

`src/darshan.js` holds the bounds and the fallback values. `ARRIVAL_MS` is 3200
and `WITHDRAWAL_MS` is 4000. These are upper bounds over every style's two
segments, used by the untouched timer and the native hide; the renderer fades
the halo and caption over the selected style's own lengths. `UNTOUCHED_MS` is
180000. `BREATH_MS`, `SETTLE_MS`, and `SETTLE_PX` are used only by the CSS
fallback when no manifest is present.

`src/main.js` sends `{ arrivalMs, withdrawalMs, breathMs, settleMs, settlePx }`
in the `companion:show` payload. `src/renderer.js` writes them to the
`--arrival`, `--withdraw`, `--breath`, `--settle`, and `--settle-px` CSS custom
properties, which the fallback animations and the halo and caption fades read.
The localhost preview serves the same constants.

## The clip record

Every style except pixel comes from one 15 second image-to-video generation of a
single Krishna figure walking in from the right, standing and breathing, raising
a teaching hand, and leaving with a farewell palm. The clips were generated at
1344x768, 24 fps, with a green background requested (the painterly clip ignored
it and was matted with rembg). The prompts differ only in the style words and,
for gyan and warrior, the Mahabharat-era lean and powerful build. Segment bounds
(seconds and fps) are in each style's `manifest.json` under `source`.

The pixel style is derived from the warrior sheets by
`scripts/anim/pixelate-style.py --factor 3 --colors 24 --line 0.85 --edge 48`.
It shares one 24-colour palette, is written lossless, and is drawn with image
smoothing off.

The six figure sets are about 15 MB in total. The selected style's four decoded
sheets hold 64 to 81 MiB in memory depending on the style; switching styles
releases the previous set.

## Why the figure is video frames, not a rig

An earlier approach built an articulated cut-out rig from generated parts (heads,
expressions, limbs) and rotated them to fake movement. Rotating painted parts
cannot produce a gait: the walk read as a puppet, not a person. That work is
parked on the `archive/articulated-rig` branch, which still holds the rig source,
its parked tests, and the alternate character artwork under `assets/candidates/`.
The shipped figure moves because it is real video frames of one identity, cut
into segments and replayed.

## Rebuilding the sheets

1. Extract frames: `ffmpeg -i clip.mp4 -vsync 0 frames/f%04d.png`.
2. Find segment bounds: `scripts/anim/analyze-clip.py`.
3. Build the sheets:
   `scripts/anim/build-sheets.py <frames_dir> assets/anim/<style> --prefix <style>/ [--matte rembg] --segments ...`.
4. Assemble the combined manifest:
   `scripts/anim/assemble-manifest.py assets/anim realistic`.

`assets/anim/manifest.json` (the combined manifest in JSON form) does not ship;
it stays in the tree as the fixture the sprite tests read to confirm
`manifest.js` was generated from it.

## How to run the preview

The preview is a loopback-only browser harness around the real renderer and
corpus. It starts no Electron, requests no macOS permission, and writes no saved
state.

```bash
node scripts/preview-darshan.js
# open http://127.0.0.1:4173
```

Use the controls to replay the arrival, expand the message, advance verses, and
switch entries, including the long and grouped ones.
