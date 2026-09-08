// Every word shown to the reader comes from Bhagavad-gītā As It Is
// (A. C. Bhaktivedanta Swami Prabhupāda), copied as is from the BBT-authorized
// VedaBase edition by scripts/fetch-vedabase.js into data/gita.json.
// Nothing here paraphrases the text.

const { readFileSync } = require("node:fs");
const path = require("node:path");

const DATA_FILE = path.join(__dirname, "..", "data", "gita.json");
const EXCERPT_TARGET = 400;

// Opening sentences of Prabhupāda's purport, verbatim, never cut mid-sentence.
function purportExcerpt(purport) {
  if (!purport) return "";
  const firstParagraph = purport.split("\n\n")[0];
  const sentences = firstParagraph.match(/[^.!?]+[.!?]+["”’)]?(\s|$)/g) || [firstParagraph];
  let excerpt = "";
  for (const sentence of sentences) {
    const candidate = excerpt ? `${excerpt} ${sentence.trim()}` : sentence.trim();
    if (excerpt && candidate.length > EXCERPT_TARGET) break;
    excerpt = candidate;
    if (excerpt.length >= EXCERPT_TARGET * 0.6) break;
  }
  return excerpt;
}

function loadReflections(file = DATA_FILE) {
  let verses;
  try {
    verses = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${file} (${error.message}). Run \`npm run fetch\` to build it from VedaBase.`);
  }
  return verses.map((verse) => ({
    reference: verse.reference,
    chapter: verse.chapterTitle,
    chapterNumber: verse.chapter,
    verse: verse.verse,
    shloka: verse.shloka,
    transliteration: verse.transliteration,
    translation: verse.translation,
    meaning: purportExcerpt(verse.purport),
    source: verse.source
  }));
}

// Resolve a "--verse" request to an index into `reflections`. Accepts an exact
// reference such as "2.47" or a grouped "1.16-18", and a single "C.V" that falls
// inside a grouped span (so "1.16" and "1.18" both resolve to the "1.16-18" entry).
// Returns { index, entry } on a hit, or { error } for anything that does not match
// a real verse — the caller must never fall back silently to saved progress.
function findVerseIndex(list, request) {
  if (typeof request !== "string" || !request.trim()) {
    return { error: `no verse ${request}` };
  }
  const trimmed = request.trim();

  // Exact reference first: handles a grouped request ("1.16-18") and a plain "2.47".
  const exact = list.findIndex((item) => `${item.chapterNumber}.${item.verse}` === trimmed);
  if (exact !== -1) return { index: exact, entry: list[exact] };

  // A single "C.V": accept it when V falls inside a grouped span "A-B" of chapter C.
  const single = trimmed.match(/^(\d+)\.(\d+)$/);
  if (single) {
    const chapter = Number(single[1]);
    const verse = Number(single[2]);
    const index = list.findIndex((item) => {
      if (item.chapterNumber !== chapter) return false;
      const [from, to] = String(item.verse).split("-").map(Number);
      const end = Number.isFinite(to) ? to : from;
      return Number.isFinite(from) && verse >= from && verse <= end;
    });
    if (index !== -1) return { index, entry: list[index] };
  }

  return { error: `no verse ${trimmed}` };
}

const reflections = loadReflections();

module.exports = { reflections, loadReflections, purportExcerpt, findVerseIndex };
