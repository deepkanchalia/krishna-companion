# Security

## What the app touches

Krishna Companion runs on your machine and makes no network request of its own.

- It reads and writes its own data directory (on macOS,
  `~/Library/Application Support/krishna-companion/`): `state.json`,
  `journey.json`, `settings.json`.
- `krshna install` edits `~/.zshrc` (a marked integration block) and
  `~/.claude/settings.json` (the Claude Code prompt hook). `krshna uninstall`
  removes exactly those, byte for byte, and leaves the rest untouched.
- While voice is on, a global key hook watches the Space key system-wide and
  compares key codes only; the key is observed, never swallowed. Voice is off by
  default.
- The only outbound action is opening a VedaBase verse URL in your browser, on an
  explicit click, and only a URL that already exists in the corpus.

Audio and transcripts are never written to disk or sent anywhere. The prompt seen
by the Claude Code hook is checked in memory and never stored or logged.

## Reporting a vulnerability

Please report security issues through GitHub's private vulnerability reporting on
this repository (Security tab, "Report a vulnerability"). Do not open a public
issue for a vulnerability.

You can expect an initial response within seven days.
