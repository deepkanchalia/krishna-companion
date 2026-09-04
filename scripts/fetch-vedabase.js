#!/usr/bin/env node
// Builds data/gita.json from the BBT-authorized VedaBase edition of
// Bhagavad-gītā As It Is (https://vedabase.io/en/library/bg/).
//
// Honours vedabase.io/robots.txt (Crawl-delay: 10). Every page is cached in
// data/cache/ so a re-run only fetches what is missing. Text is copied as is:
// Devanagari, roman verse text, Prabhupāda's translation and the opening of
// his purport. Nothing is paraphrased.
//
//   node scripts/fetch-vedabase.js            # fetch + build
//   node scripts/fetch-vedabase.js --build    # rebuild JSON from cache only

const fs = require("node:fs");
const path = require("node:path");

const BASE = "https://vedabase.io";
const DELAY_MS = Number(process.env.VEDABASE_DELAY_MS || 10_000);
const CHAPTERS = 18;
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, "data", "cache");
const outputFile = path.join(root, "data", "gita.json");
const buildOnly = process.argv.includes("--build");

const CHAPTER_WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(urlPath, cacheName) {
  const cacheFile = path.join(cacheDir, cacheName);
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
  if (buildOnly) throw new Error(`Missing cache for ${urlPath}; run without --build first.`);

  const url = BASE + urlPath;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "krishna-companion-fetch/0.1 (personal study tool; respects Crawl-delay)" },
      signal: AbortSignal.timeout(30_000)
    }).catch((error) => ({ ok: false, status: error.name }));
    if (response.ok) {
      const html = await response.text();
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFile, html);
      await sleep(DELAY_MS);
      return html;
    }
    console.error(`  ${url} -> ${response.status}, retry ${attempt}`);
    await sleep(DELAY_MS * attempt);
  }
  throw new Error(`Could not fetch ${url}`);
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function htmlToLines(fragment) {
  const withBreaks = fragment
    .replace(/<h2[\s\S]*?<\/h2>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function block(html, className) {
  const marker = `class="${className}"`;
  const start = html.indexOf(marker);
  if (start === -1) return "";
  const rest = html.slice(html.indexOf(">", start + marker.length) + 1);
  const end = rest.search(/class="av-(devanagari|verse_text|synonyms|translation|purport)"|<div class="mt-8|<\/main>/);
  const fragment = end > 0 ? rest.slice(0, end) : rest;
  return fragment.slice(0, fragment.lastIndexOf("<") === -1 ? undefined : fragment.lastIndexOf("<"));
}

function parseVerse(html, chapter, slug) {
  const devanagari = htmlToLines(block(html, "av-devanagari"));
  const verseParts = htmlToLines(block(html, "av-verse_text"));
  const translation = htmlToLines(block(html, "av-translation")).join(" ");
  const purport = htmlToLines(block(html, "av-purport"));

  return {
    chapter,
    verse: slug,
    reference: `Bhagavad-gītā As It Is ${chapter}.${slug}`,
    shloka: devanagari.join("\n"),
    transliteration: verseParts.join("\n"),
    translation,
    purport: purport.join("\n\n"),
    source: `${BASE}/en/library/bg/${chapter}/${slug}/`
  };
}

function parseChapter(html, chapter) {
  const title = htmlToLines(html.match(/<h1[\s\S]*?<\/h1>/)?.[0] || "").join(" ");
  const pattern = new RegExp(`href="/en/library/bg/${chapter}/([0-9]+(?:-[0-9]+)?)/"`, "g");
  const slugs = [...new Set([...html.matchAll(pattern)].map((match) => match[1]))]
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return { title, slugs };
}

function verifySequence(chapter, slugs) {
  let expected = 1;
  for (const slug of slugs) {
    const [from, to] = slug.split("-").map(Number);
    if (from !== expected) throw new Error(`Chapter ${chapter}: expected verse ${expected}, found ${slug}`);
    expected = (to || from) + 1;
  }
  return expected - 1;
}

async function main() {
  const reflections = [];
  let verseTotal = 0;

  for (let chapter = 1; chapter <= CHAPTERS; chapter += 1) {
    const chapterHtml = await fetchPage(`/en/library/bg/${chapter}/`, `chapter-${chapter}.html`);
    const { title, slugs } = parseChapter(chapterHtml, chapter);
    const verseCount = verifySequence(chapter, slugs);
    verseTotal += verseCount;
    const chapterLabel = `Chapter ${CHAPTER_WORDS[chapter - 1]} · ${title}`;
    console.log(`Chapter ${chapter}: ${title} (${slugs.length} entries, ${verseCount} verses)`);

    for (const slug of slugs) {
      const html = await fetchPage(`/en/library/bg/${chapter}/${slug}/`, `bg-${chapter}-${slug}.html`);
      const verse = parseVerse(html, chapter, slug);
      for (const field of ["shloka", "transliteration", "translation"]) {
        if (!verse[field]) throw new Error(`${verse.reference}: empty ${field}`);
      }
      reflections.push({ chapterTitle: chapterLabel, ...verse });
    }
    // Progressive save so a partial corpus is usable while the crawl continues.
    fs.writeFileSync(outputFile, JSON.stringify(reflections, null, 2) + "\n");
  }

  console.log(`Wrote ${reflections.length} entries covering ${verseTotal} verses to ${path.relative(root, outputFile)}`);
}

module.exports = { parseChapter, parseVerse, verifySequence };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
