# Darshan glide and micro-motion — Fable handoff

Branch: `codex/darshan-message-animation`. Owner decision recorded 2026-09-09.
This branch is an M1 UI slice, not a claim that every M1 native acceptance check
has passed. It is based on the `fdae25b` darshan flow over merged B2 `8731b8b`.

## Owner decision: articulated rig parked

The AI-generated cut-out puppet did not produce a natural gait or dependable
expressions. Rotating painted parts distorted anatomy, clothing, hands, and the
face, and there was no animator-authored keyframed gait. M1 therefore ships only
the original `assets/krishna.png` artwork as one image layer.

The rig history remains available under `assets/candidates/rig/` and
`experiments/articulated-rig/`. Its code, tests, model notes, prompts, generated
atlases, and screenshots are reference material for a future human animator.
Neither directory is included in the npm package or active test suite.

## Shipped experience

- The native companion window is hidden between darshans.
- A single figure glides horizontally in from the right in 0.95 seconds; the
  three-line translation bubble reveals after 1.1 seconds.
- While arriving or present, the image breathes on a 4-second ease-in-out scale
  from 1.000 to 1.012 and back. There is no JavaScript animation loop.
- On arrival the figure plays one 6 px ease-out settle over 400 ms; a continuing
  (Next verse) darshan keeps the figure in place and does not re-settle.
- Blink is omitted: the parked heads atlas
  (`assets/candidates/rig/krishna-heads-realistic.png`) contains no closed-eyes
  frame, and its heads sit ~38 px off the shipped figure's eye line at rendered
  1x size, far beyond the 1 px tolerance, so no aligned blink overlay is possible.
- Tap the translation or press Enter after engaging the card to expand the full
  translation and purport opening. Verbatim corpus strings are never rewritten.
- Next verse advances exactly one corpus entry and keeps the figure present.
- An untouched verse withdraws after 180 seconds following arrival. Expansion
  cancels that timeout; Next starts a new timeout.
- Withdrawal glides right in 0.85 seconds; the native window hides at 0.9 seconds.
- Reduced motion uses a fixed scale of 1.000 with no breathing loop.

## Integration boundaries

- `src/darshan.js` owns the 1.1-second arrival, 180-second untouched, and
  0.9-second withdrawal timers without importing Electron.
- `src/main.js` owns saved placement, hidden-window lifecycle, focus gating,
  readiness, progression, and native hiding.
- `src/index.html`, `src/renderer.js`, and `src/styles.css` own the staged card,
  single-image glide, and CSS-only breathing motion.
- `scripts/preview-darshan.js` is a loopback-only browser harness around the real
  renderer and corpus. It has no Electron, permissions, or persistence access.

The existing `restingPosition` schema is unchanged. Opening still uses
`showInactive()` and becomes focusable only after an explicit pointer engagement.
The renderer CSP retains `connect-src 'none'`; source links remain main-process
allowlisted against the corpus before `openExternal`.

## Evidence

Local macOS, Node 24.13.0:

```text
ℹ tests 103
ℹ pass 102
ℹ fail 0
ℹ skipped 1
```

The skipped check is the optional prebuilt voice helper. Tests never launched
Electron or requested a macOS permission. `npm pack --dry-run --json` contains no
rig candidates, experiments, preview tooling, or compiled helper.

Renderer-only browser review used `http://127.0.0.1:4173` at 1470×956. The tallest
entry, 14.22-25, rendered as exactly three lines in stage one. In stage two the
660×866 iframe and 832px card remained within the viewport; its 1053px content
scrolls inside the card. Computed image motion reported one source image,
`breathe`, `4s`, `ease-in-out`, and a sampled scale of 1.00975. After withdrawal,
the card and presence had zero opacity and the image animation was `none`.

- [Tallest three-line translation](evidence/darshan-translation.png)
- [Tallest expanded reading](evidence/darshan-long-expanded.png)
- [After withdrawal](evidence/darshan-withdrawn.png)

## Display provenance and remaining acceptance

Translation, purport opening, chapter, reference, and source URL come exclusively
from `src/content.js` / `data/gita.json` and are assigned with `textContent`.
Buttons, headings, status notes, and preview labels are fixed product chrome. No
new display sink or untrusted-text path was added, and corpus bytes remain untouched.

Native focus return, saved-display placement, first-launch stopwatch, arrival
performance trace, five-minute CPU sampling, and window-list absence still need
their documented human checks. Schedule extensions, typing deferral, and the
fullscreen guard remain outside this UI slice. No native performance or complete
M1 acceptance claim is made.

Criteria touched: C3, C8, C10, M1.5, M1.6, M1.7, M1.8, UI1–UI5.
