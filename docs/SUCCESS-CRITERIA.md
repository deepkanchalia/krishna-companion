# Success criteria

The bar every change is measured against. Numbers, not adjectives. Each criterion has an ID; pull requests cite the IDs they touch and attach the evidence (test output, screenshot, or recording).

Status values: `held` = enforced by an automated check today, and the named check asserts exactly what the row says; `manual` = checked by hand before merge, with the procedure written in the row; `proposed` = target for a milestone not yet built. Change a number by editing this file in the same pull request that depends on it.

## Always (v0.2, must keep holding)

| ID | Criterion | Check | Status |
|----|-----------|-------|--------|
| C1 | Corpus structure: 18 consecutive chapters, verse spans that sum to 700 with no gap or overlap, every entry carrying a reference and source URL derived from its chapter and verse, and non-empty Devanagari, transliteration, and translation fields (each over 20 characters). | `test/content.test.js` | held |
| C2 | Corpus text is verbatim after the fetch script's documented normalization (HTML entities decoded, markup removed, whitespace collapsed). Procedure: pick 10 entries with `node -e` using seed 2026 over the entry index, re-parse each cached page in `data/cache/` with `scripts/fetch-vedabase.js` functions, and diff translation and purport against `data/gita.json`. Zero differences. | manual, after any run of `npm run fetch` | manual |
| C3 | Teaching content shown anywhere (card, bubble, `krshna context`, zsh prompt segment, notifications) comes only from `data/gita.json`. Untrusted text (prompt text, tool output, file paths, voice transcripts) never reaches a display sink. Fixed product chrome such as "Continue", the source label, and status words is allowed. Procedure: for every change under `src/`, `scripts/`, `bin/`, `shell/`, `helpers/`, list each new or changed display or notification call and name where its string comes from. | code review checklist in the pull request | manual |
| C4 | Fresh clone → `npm ci --ignore-scripts` → `npm test` passes with 0 failures on macOS and Ubuntu, Node 20 and 22. | `.github/workflows/ci.yml` | held |
| C5 | Claude Code hook: a prompt that is exactly an invocation launches the companion command and returns a block decision, so the prompt never reaches Claude. Any other prompt, and unreadable input, pass through untouched. If the launcher cannot be spawned, the prompt passes through (exit 0, empty stdout). Known gap: the hook confirms the spawn, not that a darshan appeared; a launched command that then fails still blocks the prompt (robustness batch). | `test/hook.test.js` | held |
| C6 | Voice hold timing: Space held 1999 ms does not fire; 2000 ms fires; OS key-repeat does not reset the hold; a second key cancels; a false frontmost gate blocks. | `test/voice-hold.test.js` | held |
| C6b | Voice frontmost whitelist: the hold fires only while a listed terminal or editor is frontmost. Procedure: hold Space in Terminal (fires), in a browser (does not fire). | manual on macOS | manual |
| C7 | Voice privacy: the helper requires Apple's on-device recognizer and refuses to run without it (`helpers/listen.swift`). Procedure for each release: run a darshan by voice with a network monitor open (zero connections from the helper or app), then list files modified under the app's data directory (no audio or transcript file). Deny one permission: exactly one notification appears and the app keeps running. | manual on macOS | manual |
| C8 | Opening a darshan never takes keyboard focus: characters typed while the card opens land in the terminal. Focus moves to the card only after an explicit click into it, and returns on End darshan. Procedure: type before clicking, click the card, use Enter to expand, and Escape to end. | `test/darshan-main.test.js` asserts focus calls against doubles; native procedure remains manual | manual |
| C9 | Crash safety: `state.json`, `journey.json`, `settings.json` are written by temp file plus rename, so a kill mid-write leaves the previous file intact. Progress is saved when a verse is shown, so `kill -9` mid-darshan and relaunch shows the next verse, never a repeat. A journey file with malformed entries is read past the bad entries and reported by `krshna context`. Known gap: a file that fails to parse entirely is replaced with defaults without a notice (robustness batch, quarantine instead). | `test/journey.test.js`, `test/cli.test.js`; kill test manual | manual |
| C10 | Network: the renderer cannot open connections (CSP `connect-src 'none'` in `src/index.html`); the only outbound action is opening a VedaBase URL that exists in the corpus, on an explicit click (`src/main.js` validates before `openExternal`). No `fetch`, `net`, `http`, or `loadURL` to a remote host anywhere under `src/` or `bin/`. Procedure: grep those names on every change; `npm run fetch` is the sole network path and is never called by the app. | manual, grep on each pull request | manual |
| C11 | zsh prompt segment: the shipped `shell/krshna.zsh` contains no call to `node`, `krshna`, or `krshna prompt`, and reads `state.json` directly. In a clean `zsh -f` shell the paused label renders exactly. Minute arithmetic is checked by hand: set `nextTeachingAt` 7 minutes ahead and confirm the prompt shows 7m. | `test/cli.test.js` for the first two; minutes manual | held (static and paused label), manual (minutes) |
| C12 | Install and uninstall of the Claude Code hook are idempotent from two different checkouts; uninstall removes only the marked hook entries and leaves other hooks untouched. Known gap: `krshna uninstall` does not remove the `.zshrc` block (robustness batch). | `test/hook.test.js` | held |
| C13 | `npm pack` never ships a compiled helper binary or artwork candidates. | `.github/workflows/ci.yml` pack job | held |

## M1: darshan loop (proposed)

Environment for every manual M1 check unless stated: MacBook Air 13-inch, built-in display at default scaling (1470×956 points), default bubble size, no other app in fullscreen.

| ID | Criterion | Check | Status |
|----|-----------|-------|--------|
| M1.1 | First darshan within 10 seconds, measured from pressing Enter on `krshna` (with an empty user data directory and `npm install` already done) to the translation being readable on screen. 3 runs, all under 10 s. | manual, stopwatch, screen recording | proposed |
| M1.2 | Schedule presets 30, 60, 90, 180 minutes and once a day at a chosen HH:MM. Once-a-day fires exactly once per calendar day, survives sleep/wake and a midnight crossing. | unit tests on the scheduler with fake clocks | proposed |
| M1.3 | Quiet while typing: no darshan starts if any key was pressed in the last 20 seconds. A blocked darshan is deferred, retried every 5 seconds, and dropped after 10 minutes in favour of the next slot. Never dropped silently: the deferral is visible in `krshna context`. | unit tests with fake input timestamps | proposed |
| M1.4 | Fullscreen guard: no darshan over a fullscreen application. Deferred as in M1.3. | manual on macOS | proposed |
| M1.5 | Two-stage bubble: stage one shows the translation only, at most 3 lines in the environment above. Tap or Enter expands to the purport opening. The entry with the tallest rendered stage two still fits inside the display. | screenshots of both stages for the tallest entry; unit test that tap and Enter both send the expand message | proposed |
| M1.6 | Single-image arrival and withdrawal occur within the companion window at the saved resting position, each in at most 1.1 seconds. `assets/krishna.png` glides horizontally from and to the right edge without articulated parts. While present, breathing is a 4-second ease-in-out scale from 1.000 to 1.012 and back, with no JavaScript animation loop. The window is placed on the saved display and does not follow the cursor. | `test/micro-motion.test.js` and `test/darshan.test.js` for artwork, CSS and timings; localhost-preview screenshots and computed-style inspection plus native placement check | proposed |
| M1.7 | Absent between darshans: no companion window is visible (window list shows none), no image animation is selected in the absent phase, and the app's average CPU over a 5-minute Activity Monitor sample is under 1 percent. Reduced motion shows the fixed image without a loop. | `test/micro-motion.test.js`; Activity Monitor and window list | proposed |
| M1.8 | An untouched darshan withdraws on its own after 3 minutes. A darshan the reader has expanded stays until closed. | unit test on the timeout; manual | proposed |
| M1.9 | Every `held` criterion in the Always table still passes in CI, and every `manual` one is re-run and ticked in the milestone pull request. | CI plus the manual list above | proposed |

## Darshan animation branch evidence

The `codex/darshan-message-animation` branch implements the M1 UI slice and its
necessary window/timer wiring, not the entire M1 milestone. M1.1, M1.5–M1.8 have
implementation and automated/renderer evidence in the branch's tests (`test/darshan.test.js`, `test/darshan-main.test.js`, `test/micro-motion.test.js`, `test/renderer.test.js`).
The M1 rows remain proposed until their native acceptance checks pass. In
particular, the performance trace (M1.6), CPU sampling
(M1.7), schedule extensions (M1.2), typing deferral (M1.3), and the fullscreen guard
(M1.4) are not claimed by this branch.

| ID | Branch criterion | Check | Status |
|----|------------------|-------|--------|
| UI1 | One `assets/krishna.png` figure glides from the right in 0.95 seconds; the message reveals at 1.1 seconds; withdrawal glides right in 0.85 seconds and the native window hides at 0.9 seconds. The present figure breathes on a 4-second ease-in-out scale from 1.000 to 1.012 and back. Reduced motion is fixed, and absence has no animation selector or JavaScript loop. | `test/micro-motion.test.js`, `test/darshan.test.js`, `test/renderer.test.js`; visual browser review | proposed pending native placement and CPU acceptance |
| UI2 | One explicit Next verse action advances exactly one corpus entry, including grouped verses and wrapping 18.78 to 1.1. A specific verse preview never advances or saves progress. | `test/darshan-main.test.js` with Electron doubles | held |
| UI3 | Every one of the 657 entries reaches the message renderer verbatim. Empty purports create no message. Tap and Enter expand; Escape during arrival cancels the pending reveal. | `test/renderer.test.js` | held |
| UI4 | Untouched timeout is 180 seconds after arrival. Expanding cancels it, Next replaces it, double dismissal withdraws once, and window recreation cancels old timers. | `test/darshan.test.js`, `test/darshan-main.test.js` | held |

### UI5 · hands and expressions (parked)

Owner decision, 2026-09-09: the generated cut-out puppet cannot produce a natural
gait or reliable expressions without distorting painted anatomy and clothing.
Hands, face patches, articulated joints, multiple styles, and their tests are not
part of M1. The preserved source material lives under `experiments/articulated-rig/`
and `assets/candidates/rig/` for a human animator who can author a unified model
sheet, clean separations, fixed pivots, keyframed gait, cloth overlap, gestures,
expressions, and transitions. Status: parked; no visual acceptance is claimed.

## How to use this file

1. Before writing a brief or a spec for a milestone, add its criteria here first with a number in every row.
2. A pull request cites the IDs it touches and attaches the evidence for each.
3. Review flags only gaps against these IDs, not preferences.
4. After shipping, log misses in `docs/DOGFOOD.md` and tighten the numbers here.
