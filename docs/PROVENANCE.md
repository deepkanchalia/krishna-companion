# Corpus provenance

This document records where the scripture corpus in `data/gita.json` comes from,
how it is produced, and how anyone can verify that the committed bytes are the
ones the pipeline generated and have not been altered since.

It documents the corpus **data** — source, method, dates, counts, and a
content hash. It does **not** restate the copyright or the terms of use. Those
live in [`LICENSE-ASSETS.md`](../LICENSE-ASSETS.md): the text is
© The Bhaktivedanta Book Trust International, Inc., reproduced here with
permission, and is not covered by this project's MIT license. Read that file
before redistributing any part of the corpus.

## What the corpus is

`data/gita.json` is the complete *Bhagavad-gītā As It Is* by A. C. Bhaktivedanta
Swami Prabhupāda: all eighteen chapters, every verse, copied verbatim. Each
entry carries the Devanagari, the roman transliteration, Prabhupāda's
translation, and the opening of his purport. Nothing is paraphrased, summarized,
or generated (see `CLAUDE.md` and the README source policy).

## Where it comes from

The source is the BBT-authorized VedaBase edition:

- **Source:** Bhagavad-gītā As It Is, vedabase.io
- **Base URL:** https://vedabase.io/en/library/bg/

Each entry's `source` field is the exact VedaBase verse URL it was copied from,
for example `https://vedabase.io/en/library/bg/2/47/`.

## How it is produced

`scripts/fetch-vedabase.js` builds the corpus:

- It reads `https://vedabase.io/en/library/bg/`, walking the eighteen chapter
  pages and every verse page they link to.
- It honors `vedabase.io/robots.txt`, which sets `Crawl-delay: 10`. The script
  waits ten seconds between requests (`crawlDelaySeconds` in the manifest).
- Every fetched page is written to `data/cache/` (gitignored). A re-run fetches
  only what is missing, so the network is touched at most once per page.
- Only a direct `200` response (not a redirect) is ever cached, and the parsed
  fields are validated before an entry is accepted, so a bad or wrong page can
  never be read back as scripture.

Two entry points:

```
node scripts/fetch-vedabase.js            # fetch missing pages, then build
node scripts/fetch-vedabase.js --build    # rebuild from the cache only, offline
```

The `--build` run performs no network requests. Because all cache pages are
present in this repository's build environment, it reproduces `data/gita.json`
byte for byte and rewrites `data/gita.manifest.json` from the freshly built
data. The manifest is emitted by the pipeline — not hand-written — so it cannot
drift from the corpus it describes.

## Source-crawl window

**The corpus was crawled and assembled on 2026-09-04 (IST).**

How this was derived: `data/cache/` is gitignored, and every cached file in the
current working tree shares a single modification timestamp
(`2026-09-04 22:57:57`) — a bulk filesystem copy, not the crawl itself — so file
mtimes are not reliable evidence. The reliable record is the git history of the
pipeline output, `data/gita.json`:

- `2026-09-04 20:03 IST` — initial project snapshot as built (`eaa9d24`)
- `2026-09-04 20:29 IST` — partial corpus, chapters 1–2 committed (`acba6b7`)
- `2026-09-04 22:58 IST` — complete 700-verse corpus committed (`d4883b8`)

At a ten-second crawl delay, 675 pages take at least ~113 minutes to fetch,
which is consistent with a single crawl completing within that ~20:03–22:58 IST
window on 2026-09-04. No later commit changed the verse content; a public-release
commit on 2026-09-12 (`c260cf2`) rewrote the file's formatting only.

Reproduce this derivation with:

```
git log --format='%ad | %h | %s' --date=iso -- data/gita.json
```

## Counts

Computed from the data itself and recorded in the manifest:

- **Chapters:** 18
- **Entries:** 657 (grouped verses such as `1.16-18` are one entry)
- **Verses:** 700

## Integrity anchor

`data/gita.manifest.json` records the SHA-256 of the exact `data/gita.json`
bytes the build wrote:

```
sha256  38828c9e17a2cde2fc04b30c1482e2a411109008689952e082df5d66836f0a27
```

## How to verify

1. **Hash the committed corpus** and confirm it equals the manifest's `sha256`:

   ```
   shasum -a 256 data/gita.json
   ```

   The hex digest must equal the `sha256` field in `data/gita.manifest.json`.

2. **Reproduce from the cache.** From the cached pages, an offline rebuild
   yields the same file and the same hash:

   ```
   node scripts/fetch-vedabase.js --build
   shasum -a 256 data/gita.json
   ```

3. **Automated gate.** `test/provenance.test.js` fails if the corpus is edited
   without regenerating the manifest, or if the manifest's counts do not match
   the data — run it with `npm test`.

This is an independent project. It is not affiliated with or endorsed by ISKCON,
the Bhaktivedanta Book Trust, or VedaBase.
