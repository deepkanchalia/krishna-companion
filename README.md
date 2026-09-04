# Krishna Companion

A quiet companion that lives alongside long terminal sessions. Start it once with `krshna`; a small, movable Kṛṣṇa figurine remains over the terminal. Every 30 minutes, it expands in place into a compact grey-glass card with a short English verse excerpt and explanation from *Bhagavad-gītā As It Is*.

Only the small area behind the card is blurred. The resting figurine has no window background. Drag Kṛṣṇa directly with the cursor to place Him anywhere; that position survives restarts. The widget does not cover the screen, steal focus, suspend your terminal, or stop any running process. After 28 seconds it returns to the resting figurine.

The prototype journey contains the source-checked opening sequence, Chapter 1 verses 1.1–1.8, and advances in order. Progress is saved locally, so restarting the companion continues with the next available teaching instead of choosing a random quote. A public release should expand this curated sequence only with BBT permission.

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
krshna now       # invite a reflection now
krshna pause     # quiet mode
krshna resume
krshna status
krshna context    # recall the previous explanation and next verse
krshna stop
```

To add a literal `/krshna` command and a persistent `🪶 Kṛṣṇa · 30m` right-prompt to zsh:

```bash
krshna install
```

Open a new terminal, then `/krshna` summons a reflection. `/krshna pause`, `/krshna resume`, and `/krshna stop` work as expected. The unprefixed `krshna` command remains the portable option across shells and terminal agents.

To see the experience immediately:

```bash
npm run demo
```

To render a local `preview.png` for design review without leaving the companion running:

```bash
npm run preview
```

Use `npm run preview:resting` to capture the always-visible figurine state.

Use `⌘⇧K` on macOS or `Ctrl+Shift+K` elsewhere to call up a reflection at any time. The tray/menu-bar icon can also show a reflection, pause the schedule, or change the cadence to 30, 60, or 90 minutes.

## Options

```bash
npm start -- --interval=45 --duration=20
```

- `--interval`: minutes between reflections (default: `30`)
- `--duration`: seconds the expanded card remains visible (default: `28`)
- `--demo`: show a reflection just after launch

Press `Esc`, `Enter`, or “Continue coding” to collapse the card early.

## Source policy

All verse excerpts and the meaning of each reflection are based only on A. C. Bhaktivedanta Swami Prabhupāda’s *Bhagavad-gītā As It Is*, using the BBT-authorized [VedaBase](https://vedabase.io/en/library/bg/) edition. Each reflection includes a direct link to its source verse. No third-party Gītā translation or commentary is used.

The excerpts remain the property of their respective copyright holder. This repository’s MIT license covers the software code, not the quoted source material. The Krishna artwork was generated specifically for this project. This is an independent prototype and is not affiliated with or endorsed by ISKCON, the Bhaktivedanta Book Trust, or VedaBase. Obtain written permission before publicly distributing BBT text at scale.

## How context and sequence are saved

The companion never reads or stores terminal output, prompts, source code, or conversations. Its “context” is limited to its own Gītā journey:

- `journey.json` atomically stores the next verse index and up to 100 previously shown references, English excerpts, explanations, source links, and timestamps.
- `settings.json` stores only the resting figurine position.
- `state.json` stores runtime information such as whether the app is live, the timer, and the next reference.

On macOS these files live in `~/Library/Application Support/krishna-companion/`. Linux uses the standard config directory and Windows uses AppData. Run `krshna context` to see the last explanation and what comes next.

## Adversarial release review

After authenticating Claude Code with `claude /login`, run the repository’s read-only public-release review:

```bash
npm run review:claude
```

The review command disables session persistence and gives Claude only `Read`, `Glob`, and `Grep` tools; it cannot modify the project.
