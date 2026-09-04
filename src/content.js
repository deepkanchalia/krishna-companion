// Every word shown to the reader comes from Bhagavad-gītā As It Is
// (A. C. Bhaktivedanta Swami Prabhupāda), copied as is from the BBT-authorized
// VedaBase edition by scripts/fetch-vedabase.js into data/gita.json.
// Nothing here paraphrases the text.

const { readFileSync } = require("node:fs");
const path = require("node:path");

const DATA_FILE = path.join(__dirname, "..", "data", "gita.json");
const EXCERPT_TARGET = 240;

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

const reflections = loadReflections();

module.exports = { reflections, loadReflections, purportExcerpt };
