# Contributing

Thank you for looking at Krishna Companion. This is a small, careful project.
Read `CLAUDE.md` and `docs/SUCCESS-CRITERIA.md` before you change behavior.

## Development setup

You need Node.js 20 or newer.

```bash
git clone https://github.com/deepkanchalia/krishna-companion.git
cd krishna-companion
npm ci --ignore-scripts
npm test
```

`--ignore-scripts` skips the Electron download and the native rebuild. The tests
are pure Node by design: nothing a test imports requires `electron` or
`uiohook-napi` at load time, and no test starts the app. `npm test` must pass
after `npm ci --ignore-scripts`. Run `npm run lint` before you open a pull
request.

To see the darshan without starting Electron:

```bash
node scripts/preview-darshan.js
# open http://127.0.0.1:4173
```

## The rules that bind a change

- Scripture is verbatim Bhagavad-gītā As It Is. Never paraphrase, summarize, or
  generate a verse, translation, or purport. `data/gita.json` is produced only by
  `npm run fetch`.
- Teaching content shown anywhere comes only from the corpus. Untrusted text
  (prompt text, tool output, paths, voice transcripts) never reaches a display
  sink.
- Do not add a language model to the product.
- Match the existing code style by hand. There is no formatter. No new dependency
  without a stated reason in the pull request.
- Do not change `data/`, `assets/`, or the license terms of the text and artwork.
  See `LICENSE-ASSETS.md`.

The full list is in `CLAUDE.md`.

## Pull requests

- Branch off `main`. Open the pull request against `main`
  (`gh pr create --base main`).
- The body cites the success-criteria IDs it touches (`docs/SUCCESS-CRITERIA.md`)
  and attaches the evidence: the `npm test` summary line, and a screenshot or
  recording for anything visual.
- Commit messages say what changed and why, in plain words.
- Pull requests are squash-merged, so keep the title clear.
