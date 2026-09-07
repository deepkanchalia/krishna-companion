# Krishna Companion: rules for any agent working in this repo

Every line here prevents a mistake that already happened or would be costly. Read `docs/SUCCESS-CRITERIA.md` before changing behaviour.

- Scripture is verbatim Bhagavad-gītā As It Is from vedabase.io. Never paraphrase, summarise, or generate a verse, translation, or purport. `data/gita.json` changes only through `npm run fetch`.
- The card, bubble, CLI, and prompt segment show corpus text only. Never route prompt text, tool output, paths, or transcripts to the screen.
- There is no language model inside the product and there will not be one. No chat, no "ask Krishna".
- Never launch the Electron app from a test. On macOS Electron's user data dir ignores `$HOME`, so a test launch writes to the real `state.json`. CLI tests use a temporary `HOME` and never start the app.
- Never automate a macOS permission sheet (Microphone, Speech Recognition, Input Monitoring). A human clicks them. Do not reset TCC.
- `npm test` must pass after `npm ci --ignore-scripts`: CI has no native toolchain, so nothing a test imports may require `electron` or `uiohook-napi` at load time.
- Before overwriting a file you did not create in this session, run `git show HEAD:<file>` and preserve what is there. More than one agent works in this repo.
- Match the existing code style by hand. No formatter, no new dependencies without a stated reason in the pull request.
- Pull requests target `main` (`gh pr create --base main`). The body cites the success-criteria IDs touched and attaches evidence: the `npm test` summary line, and a screenshot or recording for anything visual.
- Keep Electron pinned to the version in `package.json`. Node 20 or newer.
- Text and artwork are not MIT. Do not change `LICENSE`, `data/`, or `assets/` licensing metadata without the owner's explicit decision.
