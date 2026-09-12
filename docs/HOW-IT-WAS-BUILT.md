# How it was built

I am a product manager. I build with AI seats: I decide what to build, I test it,
I merge it, and I hold the taste. This is the operating system I used to build
Krishna Companion, and the numbers behind it. No hype, no transcript.

## 1. The premise

A devotional companion for people who work in a terminal. The text must be
verbatim Bhagavad-gītā As It Is, word for word. There is no language model in the
product, because a misquote to this audience is a public failure. The figure is a
darshan, a moment of seeing, not a pet.

## 2. The operating system

I ran the build as a pipeline, not a chat:

1. A written spec with measurable success criteria before any code
   (`docs/SUCCESS-CRITERIA.md`). Each row carries a status and the test that
   holds it.
2. One build seat, working one task at a time from a written brief.
3. Every pull request went through an independent audit in a clean worktree,
   then a separate adversarial review that read the change as a hostile stranger.
4. Then a triage, where each finding got a decision: fix, defer with a reason, or
   reject.
5. Then a fix round, then a second audit of the fixed head.
6. I tested on the real app and merged. Evidence appropriate to the change is
   attached to each pull request: the test summary on every one, and the package
   contents or a screen capture where those apply.
7. A rules file for any agent working in the repo (`CLAUDE.md`) states the
   non-negotiables, so a new seat cannot quietly break them.

## 3. Decisions I held

- Verbatim scripture only. The corpus is fetched once at the site's crawl delay
  and cached; nothing is paraphrased.
- No chat and no generated text in the product.
- The figure is framed as a darshan, not a mascot.
- The walk comes from generated video frames of one identity. An earlier
  articulated rig built from generated parts was tried and parked: rotating
  painted parts cannot produce a gait. That work lives on
  `archive/articulated-rig`.
- Six figures kept behind one switch, after I tested each on my own screen.
- Voice is off by default, so a first launch asks for no permission.
- The walk-in bound was revised to 3.2 seconds rather than re-cutting the clips,
  and that decision is recorded in the criteria.

## 4. Numbers

| What | Value |
|------|-------|
| First commit | 2026-09-04 |
| Pull requests merged | 8 into main (#2 through #9; #1 was a duplicate merge of #2's branch), the last a hardening pass |
| Tests | 155, none start Electron |
| CI | 5 test lanes (macOS and Ubuntu on Node 20 and 22, plus a Windows experimental lane), a lint-and-audit job, and a pack-guard job |
| Findings on the figure-styles pull request | 13 by the audit, 18 by the adversarial review with 8 overlapping, and 1 regression caught by the second audit |
| Findings on the process pull request | 27, all addressed |
| Package | about 17 MB, six figure sets |

## 5. What the seats are for

- I decide what to build, I test, I merge, and I hold the taste.
- A planning seat turns decisions into briefs and audits the results.
- A build seat executes one brief at a time and pushes per step.
- An adversarial review seat reads every pull request as a hostile stranger.
- Nothing merges on one seat's word.

## 6. What is still owed

Honestly: native screen recording and a five-minute CPU and memory sample on the
real window; signed and notarized builds; and a human pass on Windows and Linux,
which are untested by a person today.
