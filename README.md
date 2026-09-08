# Krishna Companion

A quiet companion that lives alongside long terminal sessions. Start it once with `krshna`; a small, movable Kṛṣṇa figurine remains over the terminal. Every 30 minutes it expands in place into a compact grey-glass card with the next verse of *Bhagavad-gītā As It Is*: Śrīla Prabhupāda's translation, word for word, followed by the opening lines of his purport.

Only the small area behind the card is blurred. The resting figurine has no window background. Drag Kṛṣṇa directly with the cursor to place Him anywhere; that position survives restarts. The widget does not cover the screen, steal focus, suspend your terminal, or stop any running process. The teaching stays until you choose Continue; the card grows to fit long verses, so nothing is ever cut.

The journey begins at Chapter 1, text 1 and moves through all 700 verses in order (verses that Śrīla Prabhupāda translated together, such as 1.16-18, appear together). Progress is saved locally, so restarting the companion continues with the next teaching instead of choosing a random quote.

## Make it live

Requires Node.js 20 or newer. On macOS, the optional voice feature also needs the Xcode Command Line Tools (`xcode-select --install`).

```bash
git clone https://github.com/deepkanchalia/krishna-companion.git
cd krishna-companion
npm install
mkdir -p ~/.local/bin
ln -s "$PWD/bin/krshna.js" ~/.local/bin/krshna
export PATH="$HOME/.local/bin:$PATH"                     # this shell
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc  # future shells
krshna install   # adds /krshna, the terminal status, and the Claude Code voice hook
krshna           # make the companion live
```

If `krshna` is still not found, `~/.local/bin` is not on your `PATH`; open a new terminal after the two lines above, or add them to your shell's startup file.

The `krshna` command returns immediately; the companion continues in the background while you use Codex, Claude, Gemini, a regular shell, or another terminal agent.

```bash
krshna now       # invite a teaching now
krshna pause     # quiet mode
krshna resume
krshna status
krshna context    # recall the previous teaching and the next verse
krshna stop
```

`pause`, `resume` and `stop` only act on a running companion; they do not start one.

`krshna install` (run in the quickstart above) adds a literal `/krshna` command and a persistent `🪶 Kṛṣṇa · 30m` right-prompt to zsh. Open a new terminal, then `/krshna` summons a teaching. `/krshna pause`, `/krshna resume`, and `/krshna stop` work as expected. The unprefixed `krshna` command remains the portable option across shells and terminal agents. `krshna uninstall` removes both the zsh integration block and the Claude Code hook again, leaving the rest of your `.zshrc` untouched.

## Voice

On macOS, keep Terminal or an editor frontmost and hold Space for two seconds. The figurine pulses while listening; say “Hare Kṛṣṇa” to open the next teaching, then release Space. The key is only observed, never swallowed, so the frontmost app still receives it normally. Supported apps are Terminal, iTerm2, Warp, Ghostty, Alacritty, kitty, WezTerm, VS Code, Cursor, Zed, JetBrains IDEs, Xcode, and Windsurf.

The first use asks macOS for Microphone, Speech Recognition, and Input Monitoring or Accessibility access. Enable Krishna Companion (or Electron while running from this checkout) under **System Settings → Privacy & Security** for those services. Recognition is forced to Apple's on-device recognizer: audio and transcripts are never saved, logged, sent to Krishna Companion's renderer, or sent over the network. If the recognizer is unavailable or permission is denied, voice remains off until the next launch and a single notification explains what to allow.

The helper is built automatically at startup when voice is enabled and `helpers/listen` is missing. This requires Xcode Command Line Tools (`xcrun`); `npm run build:helper` remains available for a manual build. Windows and Linux continue to run the companion without voice.

```bash
krshna voice off
krshna voice on
```

The menu-bar checkbox **Voice (hold Space)** controls the same setting. Its default is `voice: { enabled: true, key: "Space", holdMs: 2000 }` in `settings.json`.

`krshna install` also registers Claude Code's whole-prompt hook. Saying or typing “Hare Kṛṣṇa” as the whole prompt opens the next teaching; Claude does not receive or respond to it.

To see the experience immediately (this also works while the companion is already live):

```bash
npm run demo
```

To render a local `preview.png` for design review, stop the companion first, then:

```bash
npm run preview
npm run preview -- --verse=1.32-35   # preview one specific verse
```

Use `npm run preview:resting` to capture the always-visible figurine state.

Use `⌘⌥K` on macOS or `Ctrl+Alt+K` elsewhere to call up a teaching at any time. The menu-bar icon (a peacock feather) can also show a teaching, pause the schedule, or change the cadence to 30, 60, or 90 minutes.

## Options

```bash
npm start -- --interval=45 --duration=20
```

- `--interval`: minutes between teachings (default: `30`)
- `--duration`: optionally auto-close after this many seconds (default: off)
- `--demo`: show a teaching just after launch
- `--verse`: start from one verse, e.g. `--verse=2.47` (does not change saved progress)

Click “Continue” to collapse the card. The card opens without taking keyboard focus, so `Esc` and `Enter` only close it after you click into it. If a scheduled interval arrives while a card is open, it is skipped without advancing the sequence.

## Source policy

Every word shown to the reader is copied as is from A. C. Bhaktivedanta Swami Prabhupāda's *Bhagavad-gītā As It Is*, using the BBT-authorized [VedaBase](https://vedabase.io/en/library/bg/) edition: the translation of each verse and the opening sentences of its purport. Nothing is paraphrased, summarised or rewritten, and no other Gītā translation or commentary is used. Each teaching links to its source verse. A small number of verses carry no purport on VedaBase (32 of the 657 corpus entries); for those the card shows the translation only.

`data/gita.json` is built by `npm run fetch`, which reads VedaBase at the crawl delay its `robots.txt` asks for (about two hours for the full text) and caches every page under `data/cache/`.

The text of *Bhagavad-gītā As It Is* is © The Bhaktivedanta Book Trust International, Inc. This repository's MIT license covers the software code only, not the quoted text. The Kṛṣṇa artwork is original to this project. This is an independent project and is not affiliated with or endorsed by ISKCON, the Bhaktivedanta Book Trust, or VedaBase. Obtain written permission from the BBT before distributing this repository publicly.

## How context and sequence are saved

The companion never reads or stores terminal output, source code, or conversations, and makes no network requests of its own. The one prompt it sees is through Claude Code's `UserPromptSubmit` hook: each prompt you submit is passed to the hook, which checks its text in memory against the single invocation phrase (“Hare Kṛṣṇa” as the whole prompt). Nothing about a prompt is stored, logged, or sent anywhere, whether it matches or not; nothing else is read. Beyond that, the companion's “context” is limited to its own Gītā journey:

- `journey.json` atomically stores the next verse index and up to 100 previously shown references, translations, purport excerpts, source links, and timestamps.
- `settings.json` stores the resting figurine position and local voice settings.
- `state.json` stores runtime information such as whether the app is live, the timer, and the next reference.

On macOS these files live in `~/Library/Application Support/krishna-companion/`. Linux uses the standard config directory and Windows uses AppData. Run `krshna context` to see the last teaching and what comes next.

## Platform notes

Built and verified on macOS. Windows (acrylic) and Linux (needs a compositor for the transparent window) are supported by the code but not yet tested.

## Quality bar

- `docs/SUCCESS-CRITERIA.md` is the acceptance bar. Each row says whether a test enforces it or a written manual procedure does. Pull requests cite the criterion IDs they touch and attach the evidence.
- `.github/workflows/ci.yml` runs `npm test` on macOS and Ubuntu (Node 20 and 22) and checks the npm tarball. The Windows lane is experimental: its failures are reported as warnings and do not block.
- `docs/DOGFOOD.md` is where wrong or badly timed darshans get logged, for review before each milestone.
- `CLAUDE.md` holds the rules any agent must follow when editing this repo.

## Adversarial release review

After authenticating Claude Code with `claude /login`, run the repository's read-only public-release review:

```bash
npm run review:claude
```

The review command disables session persistence and gives Claude only `Read`, `Glob`, and `Grep` tools; it cannot modify the project.
