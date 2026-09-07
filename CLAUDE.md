# Krishna Companion: rules for any agent working in this repo

Rules first, rationale in brackets. Read `docs/SUCCESS-CRITERIA.md` before changing behaviour.

- Scripture is verbatim Bhagavad-gītā As It Is from vedabase.io. Never paraphrase, summarise, or generate a verse, translation, or purport. `data/gita.json` is produced only by `npm run fetch`; a pull request that changes it says which fetch run produced it. [The audience is Bhaktivedanta followers; a misquote is a public failure.]
- Teaching content on any display sink (card, bubble, CLI, prompt segment, notifications) comes only from the corpus. Fixed product chrome such as "Continue", the source label, and status words is fine. Untrusted text (prompt text, tool output, paths, voice transcripts) never reaches a display sink. [C3]
- Do not add a language model to the product: no chat, no "ask Krishna", no generated text. [Product decision, see README Source policy.]
- Tests never start the Electron app and never spawn the production `krshna now` path. Inject a stub launcher instead. [On macOS Electron's user data dir ignores `$HOME`, so a test launch writes to the real `state.json` and can trigger a darshan on the developer's screen.]
- Tests never request a macOS permission (Microphone, Speech Recognition, Input Monitoring) and no agent automates or resets a permission sheet. A human clicks them. `test/helper.test.js` runs the built helper only when it already exists locally; do not extend it. [TCC prompts cannot be automated safely.]
- `npm test` must pass after `npm ci --ignore-scripts`: nothing a test imports may require `electron` or `uiohook-napi` at load time, and no test may depend on a compiled project artifact. [CI installs without the Electron download or the native rebuild.]
- Before overwriting a file you did not create in this session, run `git show HEAD:<file>` and preserve what is there. [More than one agent works in this repo.]
- Match the existing code style by hand. No formatter. No new dependency without a stated reason in the pull request.
- Pull requests target `main` (`gh pr create --base main`). The body cites the success-criteria IDs touched and attaches evidence: the `npm test` summary line, and a screenshot or recording for anything visual.
- Do not change the Electron range in `package.json` or its resolution in `package-lock.json` without a stated reason. Node 20 or newer.
- Text and artwork are not MIT. Do not change `LICENSE`, `data/`, or `assets/` licensing metadata without the owner's explicit decision.
