# Success criteria

The bar every change is measured against. Numbers, not adjectives. Each criterion has an ID; pull requests cite the IDs they touch and attach the evidence (test output, screenshot, or recording).

Status values: `held` = enforced by an automated check today, `manual` = checked by hand before merge, `proposed` = target for a milestone not yet built. Change a number by editing this file in the same pull request that depends on it.

## Always (v0.2, must keep holding)

| ID | Criterion | Check | Status |
|----|-----------|-------|--------|
| C1 | Corpus is the complete Bhagavad-gītā As It Is: 18 chapters, 700 verses, in order, every entry with Devanagari, transliteration, translation, and source URL. | `test/content.test.js` | held |
| C2 | Corpus text is verbatim. A random sample of 10 verses is byte-identical to the cached VedaBase page. Zero paraphrase, zero generated scripture. | manual spot check against `data/cache/` after any run of `npm run fetch` | manual |
| C3 | The card, bubble, CLI, and prompt segment show corpus text only. No prompt text, tool output, file path, or transcript ever reaches the screen. | code review of every change under `src/` and `scripts/` | manual |
| C4 | Fresh clone → `npm ci --ignore-scripts` → `npm test` passes with 0 failures on macOS and Ubuntu, Node 20 and 22, in under 60 seconds. | `.github/workflows/ci.yml` | held |
| C5 | Claude Code hook: a prompt that is exactly an invocation ("Hare Krishna", any accepted spelling) opens a darshan and the prompt never reaches Claude. Any other prompt is untouched. If the app cannot be launched, the prompt passes through (exit 0, empty stdout). | `test/hook.test.js` | held |
| C6 | Voice: Space held 1999 ms does not fire; 2000 ms fires; key-repeat does not reset the hold; only while a whitelisted terminal or editor is frontmost. | `test/voice-hold.test.js` | held |
| C7 | Voice privacy: recognition is on-device only. No audio, transcript, or partial result is written to disk or sent over the network. A denied permission disables voice for that launch with one notification and the app keeps running. | `helpers/listen.swift` forces on-device; manual on a machine with permissions denied | manual |
| C8 | The companion window never takes keyboard focus. The terminal keeps its cursor throughout a darshan. | manual: type during a darshan, characters land in the terminal | manual |
| C9 | Crash safety: kill the app mid-darshan (`kill -9`), relaunch, the next verse shows and the interrupted one is never repeated. `state.json`, `journey.json`, `settings.json` are written atomically and survive a corrupt file (repaired, never wiped silently). | `test/journey.test.js`, `test/cli.test.js`; kill test manual | manual |
| C10 | Network: the running app makes zero network requests. The only outbound action is opening the verse's VedaBase URL in the browser on an explicit click, and only URLs present in the corpus. `npm run fetch` is the sole network path and is never run by the app. | `src/index.html` CSP `connect-src 'none'`; `src/main.js` URL validation | held |
| C11 | zsh prompt segment spawns no Node process. A clean `zsh -f` shell shows the correct minutes-to-next-verse. | `test/cli.test.js` | held |
| C12 | Install and uninstall are idempotent from two different checkouts. Uninstall removes only the marked `.zshrc` block and the hook it installed. | `test/hook.test.js` | held |
| C13 | `npm pack` never ships a compiled helper binary or artwork candidates. | `.github/workflows/ci.yml` pack job | held |

## M1: darshan loop (proposed)

| ID | Criterion | Check | Status |
|----|-----------|-------|--------|
| M1.1 | First darshan within 10 seconds of first launch on a fresh machine, with zero setup steps. | manual, stopwatch, fresh user data dir | proposed |
| M1.2 | Schedule presets 30, 60, 90, 180 minutes and once a day at a chosen HH:MM. Once-a-day fires exactly once per calendar day, survives sleep/wake and a midnight crossing. | unit tests on the scheduler with fake clocks | proposed |
| M1.3 | Quiet while typing: no darshan starts if any key was pressed in the last 20 seconds. A blocked darshan is deferred, retried every 5 seconds, and dropped after 10 minutes in favour of the next slot. Never dropped silently: the deferral is visible in `krshna context`. | unit tests with fake input timestamps | proposed |
| M1.4 | Fullscreen guard: no darshan over a fullscreen application. Deferred as in M1.3. | manual on macOS | proposed |
| M1.5 | Two-stage bubble: translation only, at most 3 lines at the default size. Tap or Enter expands the purport opening. The longest verse in the corpus still fits on a 13-inch display in both stages. | screenshot of the longest verse in both stages | proposed |
| M1.6 | Arrival and withdrawal each complete in at most 1.5 seconds along the bottom edge of the display that holds the focused window. The figure stops at the corner, never follows the cursor, never wanders. | screen recording; frame timing from Electron devtools shows no dropped frames | proposed |
| M1.7 | Absent between darshans: nothing is drawn on screen and the app's idle CPU stays under 1 percent. | Activity Monitor sample over 5 minutes | proposed |
| M1.8 | An untouched darshan withdraws on its own after 3 minutes. A darshan the reader has expanded stays until closed. | unit test on the timeout; manual | proposed |
| M1.9 | Every criterion in the Always table still holds. | CI plus the manual list above | proposed |

## How to use this file

1. Before writing a brief or a spec for a milestone, add its criteria here first with a number in every row.
2. A pull request cites the IDs it touches and attaches the evidence for each.
3. Review flags only gaps against these IDs, not preferences.
4. After shipping, log misses in `docs/DOGFOOD.md` and tighten the numbers here.
