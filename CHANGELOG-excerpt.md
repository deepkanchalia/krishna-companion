Krishna Companion 0.9.0 - 2026-09-12

A quiet Bhagavad-gītā As It Is companion for long terminal sessions. Kṛṣṇa walks
in, a verse opens, and he withdraws. Verbatim text only, no language model, and
no network call from the running app.

This is the first public release. It gathers eight merged pull requests (#2
through #9) and a public-release pass that added one license posture
(LICENSE-ASSETS.md), a rewritten README with a hero recording, and new docs
(ARCHITECTURE.md, HOW-IT-WAS-BUILT.md, ANIMATION.md).

Highlights:

- The darshan loop: a figure walks in, the verse opens on tap or Enter, and he
  withdraws on a timeout or on Escape.
- Six figures, five cut from generated clips and one derived pixel set, behind
  one switch (krshna style).
- Voice off by default, on-device only, so a first launch asks for no
  permission.
- A Claude Code prompt hook and a zsh status segment.
- 155 tests, none of which start Electron; CI on macOS and Ubuntu on Node 22.

Platform support: macOS is built and used daily. Linux runs in CI but is
untested by a person. Windows is experimental.
