# Krishna Companion

A quiet companion that lives alongside long terminal sessions. Start it once with `krshna`; a small, movable Kṛṣṇa figurine remains over the terminal. Every 30 minutes it expands in place into a compact grey-glass card with the next verse of *Bhagavad-gītā As It Is*: Śrīla Prabhupāda's translation, word for word, followed by the opening lines of his purport.

Only the small area behind the card is blurred. The resting figurine has no window background. Drag Kṛṣṇa directly with the cursor to place Him anywhere; that position survives restarts. The widget does not cover the screen, steal focus, suspend your terminal, or stop any running process. The teaching stays until you choose Continue; the card grows to fit long verses, so nothing is ever cut.

The journey begins at Chapter 1, text 1 and moves through all 700 verses in order (verses that Śrīla Prabhupāda translated together, such as 1.16-18, appear together). Progress is saved locally, so restarting the companion continues with the next teaching instead of choosing a random quote.

## Make it live

Requires Node.js 20 or newer.

```bash
npm install
mkdir -p ~/.local/bin
ln -s "$PWD/bin/krshna.js" ~/.local/bin/krshna
krshna
```

The command returns immediately; the companion continues in the background while you use Codex, Claude, Gemini, a regular shell, or another terminal agent.

```bash
krshna now       # invite a teaching now
krshna pause     # quiet mode
krshna resume
krshna status
krshna context    # recall the previous teaching and the next verse
krshna stop
```

`pause`, `resume` and `stop` only act on a running companion; they do not start one.

To add a literal `/krshna` command and a persistent `🪶 Kṛṣṇa · 30m` right-prompt to zsh:

```bash
krshna install
```

Open a new terminal, then `/krshna` summons a teaching. `/krshna pause`, `/krshna resume`, and `/krshna stop` work as expected. The unprefixed `krshna` command remains the portable option across shells and terminal agents.

## Voice with Claude Code

Run `krshna install` to register the Claude Code prompt hook.
Say or type “Hare Kṛṣṇa” as the whole prompt to open the next teaching.
Claude does not receive or respond to the invocation.

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

Every word shown to the reader is copied as is from A. C. Bhaktivedanta Swami Prabhupāda's *Bhagavad-gītā As It Is*, using the BBT-authorized [VedaBase](https://vedabase.io/en/library/bg/) edition: the translation of each verse and the opening sentences of its purport. Nothing is paraphrased, summarised or rewritten, and no other Gītā translation or commentary is used. Each teaching links to its source verse.

`data/gita.json` is built by `npm run fetch`, which reads VedaBase at the crawl delay its `robots.txt` asks for (about two hours for the full text) and caches every page under `data/cache/`.

The text of *Bhagavad-gītā As It Is* is © The Bhaktivedanta Book Trust International, Inc. This repository's MIT license covers the software code only, not the quoted text. The Krishna painting is another artist's work and requires the artist's permission before any public release. This is an independent project and is not affiliated with or endorsed by ISKCON, the Bhaktivedanta Book Trust, or VedaBase. Obtain written permission from the BBT before distributing this repository publicly.

## How context and sequence are saved

The companion never reads or stores terminal output, prompts, source code, or conversations. Its “context” is limited to its own Gītā journey:

- `journey.json` atomically stores the next verse index and up to 100 previously shown references, translations, purport excerpts, source links, and timestamps.
- `settings.json` stores only the resting figurine position.
- `state.json` stores runtime information such as whether the app is live, the timer, and the next reference.

On macOS these files live in `~/Library/Application Support/krishna-companion/`. Linux uses the standard config directory and Windows uses AppData. Run `krshna context` to see the last teaching and what comes next.

## Platform notes

Built and verified on macOS. Windows (acrylic) and Linux (needs a compositor for the transparent window) are supported by the code but not yet tested.

## Adversarial release review

After authenticating Claude Code with `claude /login`, run the repository's read-only public-release review:

```bash
npm run review:claude
```

The review command disables session persistence and gives Claude only `Read`, `Glob`, and `Grep` tools; it cannot modify the project.
