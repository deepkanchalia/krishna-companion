# Darshan animation redesign — Fable handoff

Branch: `codex/darshan-message-animation`. Local worktree: `../krishna-companion-darshan`.
Requested by Deep on 2026-09-08 while Fable was unavailable. Fable remains the
orchestrator; this document is a prepared handoff, not a sent notification.
No issue, pull request, deployment, installation, or merge was requested or made.

The starting checkout was B2 (`38e401b`). B2 was subsequently squash-merged into
`main` as `8731b8b`; those two trees are identical. The redesign is rebased onto
that merged baseline so its review diff contains only this work.

## Experience

Latest revision, 2026-09-09: Deep rejected the previous cutout motion as distorted.
The description and screenshots below are historical, not visual approval.
The correction uses continuous feathered limb surfaces, restrained angles,
0.8 s pose transitions and a front-facing head. Removed the body-flattening turn,
forearm swaps and whole-head blink swaps. Frame inspection and 0.25× playback
are now available in the local preview. See `CHARACTER-MOVEMENT.md` for current
behavior and remaining acceptance. **Not release-ready:** natural side turns
remain incomplete because generated frames changed crown orientation/identity.
Only the front-facing frame is used. No merge or release is authorized.

Hand/face follow-up: corrected swapped relaxed lower-arm assignments, kept wrists
and fingers rigid beyond elbow bends, and added local smile/blink patches in all
three styles without swapping the base head. Desktop preview includes enlarged
live face/hand details. See `CHARACTER-EXPRESSIONS.md`; UI5 still awaits Deep's
visual acceptance. Side turns remain incomplete.

Latest test run: 116 tests, 115 passed, 0 failed, 1 optional helper skipped.
New runtime tests exercise loop cancellation and positive scaling; geometry tests
sample every 8 ms and enforce angle/continuity bounds. These are regression
checks, not a claim that the movement has received visual or devotional approval.

Deep superseded the original glide-only design on 2026-09-08/09. Kṛṣṇa now uses
a full-body painted skeletal rig: articulated hips/knees, shoulders/elbows,
head tilt, blink and cloth movement. Arrival takes 3.2 s before the verse appears.
Finite teaching and explanation gestures settle into restrained breathing.
Painterly, realistic and pixel-art atlases share the same choreography. The
painterly blue/gold palette follows Deep's supplied visual reference. Full-length
dhoti covers knees and calves; a shawl and overlapping fuller arms hide joins.
See `CHARACTER-MOVEMENT.md` for the movement vocabulary and event combinations.

The first message previews at most three lines with an explicit “Read full verse
& purport” action. Tap the translation or press Enter after engaging the card to
show the complete translation and a separately attributed purport message.
Long readings grow to the display limit and scroll. Text is never rewritten.
Entries without a purport show only the translation.

“Next verse” keeps Kṛṣṇa present and reveals the next corpus entry as a new
message. The renderer acknowledges readiness before another advance is allowed,
including reduced-motion mode; repeated clicks cannot skip multiple entries.
Scheduled and external `now` calls still cannot replace an open teaching.
Explicit verse previews hide Next and never change the journey.

End darshan (× or Escape) fades the message, raises a farewell palm, turns and
walks Kṛṣṇa out. The native window hides after 3.2 s. Untouched readings withdraw three minutes after arrival;
opening the full verse cancels the timeout, including a supplied `--duration`.
Next starts a fresh timeout. Old timers are cancelled on window recreation.
New users see 1.1 on first launch; returning users wait for cadence or invitation.

## Integration boundaries

- `src/darshan.js`: testable encounter timers; callbacks own withdrawal and hiding.
- `src/main.js`: hidden resting window, larger reading bounds, first-run arrival,
  explicit next-verse persistence, focus gating, readiness and timer wiring.
- `src/preload.js`: three narrow new messages: expand, next, ready.
- `src/index.html`, `src/renderer.js`, `src/styles.css`: staged messages and motion.
- `scripts/preview-darshan.js`: loopback-only browser review harness using the actual
  renderer and corpus, with an in-memory IPC bridge. No Electron or state writes.

The existing `restingPosition` schema is preserved. Native vibrancy is disabled
because it fills the transparent arrival stage; the card paints its own surface.
Listening feedback moves to the tray tooltip; the idle window stays hidden.
No dependency, Electron version, corpus, licensing, shell hook, or voice
recognition implementation changes were made. Original artwork is preserved;
three new generated atlases are added. The renderer caches their keyed pixels
once, remembers the style locally and cancels its loop while hidden or absent.
Reduced motion draws a single settled pose without a continuous loop.

## Evidence

After `npm ci --ignore-scripts --offline --no-audit --no-fund`, local macOS,
Node 24.13.0:

```text
ℹ tests 107
ℹ pass 106
ℹ fail 0
ℹ skipped 1
ℹ duration_ms 8653.281042
```

The skipped test requires the optional compiled voice helper, absent in this
worktree. New tests never import Electron or request OS permissions. Main-process
tests evaluate the shipped wiring against in-memory Electron doubles and fake
timers. Renderer tests exercise every one of the 657 corpus entries, tap/Enter,
Escape during arrival, missing purports, source attribution, and reduced motion.
Journey tests include grouped verses, final-verse wrap, preview isolation,
double-click protection, timeout cancellation and window recreation.

`node --check` and `git diff --check` pass. `npm pack --dry-run --json` excludes
the compiled helper and artwork candidates. No new network calls exist under
`src/` or `bin/`; the CSP retains `connect-src 'none'` and the source URL allowlist
remains in the main process.

Browser review uses the real renderer in a simulated desktop, not a native
Electron screenshot. Checked staged expansion, Next with Enter, translation-only
entries, long readings and withdrawal. Evidence:

- [Translation message](evidence/darshan-translation.png)
- [Purport message](evidence/darshan-purport.png)
- [Long reading](evidence/darshan-long-expanded.png)
- [After withdrawal](evidence/darshan-withdrawn.png)

The earlier glide-only compact 500px renderer had no horizontal overflow (354px message surface,
354px scroll width). The long reading retained 1053px of scrollable content in a
652px surface; keyboard navigation reached its bottom controls.

Run `node scripts/preview-darshan.js` and open `http://127.0.0.1:4173` to replay.
The harness's source button reports the validated URL without opening another tab.

Articulated revision: browser-checked all three styles with full dhoti and shawl,
and visible connected forearms in teaching/explanation poses. New screenshot
evidence is `evidence/character-paint.png`, `evidence/character-realistic.png`,
and `evidence/character-pixel.png`. These show appearance, not native performance.
Final artwork generation prompts and local asset paths: `CHARACTER-ART-PROMPTS.md`.

Current browser frame evidence: `evidence/face-hands-paint-v2.png`,
`evidence/face-hands-realistic-v2.png`, `evidence/face-hands-pixel-v2.png`.
These are inspected static frames, not a native performance recording.

## Display provenance (C3)

The enlarged preview adds only fixed chrome: LIVE FACE, HIS RIGHT, HIS LEFT and
fixed inspection timestamps. No teaching text changed in the hand/face follow-up.

Translation, purport opening, chapter and verse labels come exclusively from
`src/content.js` / `data/gita.json` and are assigned using `textContent`. The source
title and target come from the same entry. Kṛṣṇa's name, message headings, progress
controls, reading-status labels, preview notice and listening tooltip are fixed
product chrome. There is no generated dialogue or free-text input. The Gītā's
original speaker remains in each translation; other speakers are not relabelled
as Kṛṣṇa.

## Remaining acceptance / inherited issues

This implements the UI slice, not all of M1. Native focus return, dragging across
displays, actual frame timing, five-minute CPU sampling and first-launch stopwatch
checks still need manual acceptance. The window is hidden between visits, but
the proposed <1% CPU target has not been measured. Focused-app display selection,
typing deferral, fullscreen guard, new cadence presets and daily scheduling remain
backend work; placement currently uses the saved position / cursor display logic.
Voice permission proof remains deferred per Deep's existing decision.

An inherited corpus defect is visible in translation-only entries: 32 translations
contain navigation text matching `TEXT\\s*\\d`, for example 1.5 ends in
`TEXT 4TEXT 6`. The full stored purports also contain such strings in 620 entries;
the UI generally uses their opening excerpt. This exists in the unchanged B2
corpus. Fable should route a fetch/parser correction and source verification before
release. The redesign deliberately preserves the bytes instead of stripping text
at display time. Passing corpus-structure tests does not prove source-text fidelity.

Criteria touched: C3, C4, C8, C9, C10, C13, M1.1, M1.5–M1.8 and UI1–UI4.
M1 acceptance rows remain proposed; no native performance claim is made.
