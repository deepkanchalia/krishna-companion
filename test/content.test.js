const test = require("node:test");
const assert = require("node:assert/strict");
const { reflections, purportExcerpt, findVerseIndex } = require("../src/content");

const VERSES_IN_GITA = 700;

function verseSpan(verse) {
  const [from, to] = verse.split("-").map(Number);
  return { from, to: to || from };
}

test("the corpus is the complete Bhagavad-gītā As It Is, in order, from VedaBase", () => {
  let chapter = 0;
  let expectedVerse = 1;
  let verseCount = 0;

  for (const reflection of reflections) {
    if (reflection.chapterNumber !== chapter) {
      assert.equal(reflection.chapterNumber, chapter + 1, "chapters must be consecutive");
      chapter = reflection.chapterNumber;
      expectedVerse = 1;
    }
    const { from, to } = verseSpan(reflection.verse);
    assert.equal(from, expectedVerse, `${reflection.reference} breaks the sequence`);
    expectedVerse = to + 1;
    verseCount += to - from + 1;

    assert.equal(reflection.reference, `Bhagavad-gītā As It Is ${chapter}.${reflection.verse}`);
    assert.equal(reflection.source, `https://vedabase.io/en/library/bg/${chapter}/${reflection.verse}/`);
    assert.match(reflection.chapter, /^Chapter \w+ · .+/);
    assert.ok(reflection.shloka.length > 20, `${reflection.reference} has no Devanagari`);
    assert.ok(reflection.transliteration.length > 20, `${reflection.reference} has no verse text`);
    assert.ok(reflection.translation.length > 20, `${reflection.reference} has no translation`);
    assert.ok(reflection.meaning.length <= 600, `${reflection.reference} purport excerpt too long`);
  }

  assert.equal(chapter, 18, "all eighteen chapters present");
  assert.equal(verseCount, VERSES_IN_GITA);
});

test("findVerseIndex resolves grouped verses, exact verses, and rejects bad input", () => {
  const entryFor = (request) => reflections[findVerseIndex(reflections, request).index];

  // 1.16 and 1.18 fall inside the grouped span, stored as one entry "16-18".
  assert.equal(entryFor("1.16").reference, "Bhagavad-gītā As It Is 1.16-18");
  assert.equal(entryFor("1.18").reference, "Bhagavad-gītā As It Is 1.16-18");
  // 1.19 is its own entry, and 2.47 matches exactly.
  assert.equal(entryFor("1.19").reference, "Bhagavad-gītā As It Is 1.19");
  assert.equal(entryFor("2.47").reference, "Bhagavad-gītā As It Is 2.47");
  // An exact grouped reference resolves to that same grouped entry.
  assert.equal(entryFor("1.16-18").reference, "Bhagavad-gītā As It Is 1.16-18");

  // Nothing that does not exist ever falls back silently.
  assert.deepEqual(findVerseIndex(reflections, "99.1"), { error: "no verse 99.1" });
  assert.deepEqual(findVerseIndex(reflections, "abc"), { error: "no verse abc" });
});

test("purport excerpts keep whole sentences and stop early", () => {
  const purport = "First sentence here. Second one follows. Third is extra.\n\nNext paragraph is ignored.";
  assert.equal(purportExcerpt(purport), "First sentence here. Second one follows. Third is extra.");
  assert.equal(purportExcerpt(""), "");
  const long = "A".repeat(300) + ". Short tail.";
  assert.equal(purportExcerpt(long), "A".repeat(300) + ".");
});
