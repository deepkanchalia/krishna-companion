# Security

## What the app touches

Krishna Companion runs on your machine and makes no network request of its own.

- It reads and writes its own data directory (on macOS,
  `~/Library/Application Support/krishna-companion/`): `state.json`,
  `journey.json`, `settings.json`.
- Enabling voice compiles and signs an on-device speech helper into the
  checkout at `helpers/listen`; this is the only build artifact written back
  into the repository.
- `krshna install` edits `~/.zshrc` (a marked integration block) and
  `~/.claude/settings.json` (the Claude Code prompt hook), and writes a
  before-install snapshot of each next to it: `~/.zshrc.krshna-backup` and
  `~/.claude/settings.json.krshna-backup`. If `settings.json` is present but
  unparseable, the damaged file is moved aside to
  `settings.corrupt-<timestamp>.json` rather than edited. `krshna uninstall`
  removes exactly the two marked additions, byte for byte, and leaves the rest
  untouched; it leaves the two `*.krshna-backup` snapshots (and any
  `settings.corrupt-*.json`) in place for you to remove by hand.
- While voice is on, a global key hook watches the Space key system-wide and
  compares key codes only; the key is observed, never swallowed. Voice is off by
  default.
- The only outbound action is opening a VedaBase verse URL in your browser, on an
  explicit click, and only a URL that already exists in the corpus.

Audio and transcripts are never written to disk or sent anywhere. The prompt seen
by the Claude Code hook is checked in memory and never stored or logged.

## Reporting a vulnerability

Please report security issues privately. Once this repository is public and
GitHub's private vulnerability reporting is enabled, use it (Security tab,
"Report a vulnerability"). Until then, or if you prefer, contact the maintainer
privately through their GitHub profile at
https://github.com/deepkanchalia. Do not open a public issue for a
vulnerability.

You can expect an initial response within seven days.
