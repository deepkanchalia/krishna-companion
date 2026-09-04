const test = require("node:test");
const assert = require("node:assert/strict");
const { parseChapter, parseVerse, verifySequence } = require("../scripts/fetch-vedabase");

const versePage = `
<div class="av-devanagari"><h2 class="hidden">Devanagari</h2><div><div>धर्मक्षेत्रे कुरुक्षेत्रे ।<br/>मामकाः पाण्डवाश्चैव ॥ १ ॥</div></div></div>
<div class="av-verse_text"><h2 class="hidden">Verse text</h2><div><div><em>dharma-kṣetre kuru-kṣetre<br />māmakāḥ pāṇḍavāś caiva</em></div></div></div>
<div class="av-synonyms"><h2>Synonyms</h2><div>dharma-kṣetre — in the place of pilgrimage;</div></div>
<div class="av-translation"><h2>Translation</h2><div><div><strong>Dhṛtarāṣṭra said: O Sañjaya, what did they do?</strong></div></div></div>
<div class="av-purport"><h2>Purport</h2><div><div>First paragraph &amp; more.</div></div><div><div>Second paragraph.</div></div></div>
<div class="mt-8">footer</div>`;

test("parseVerse copies the four VedaBase blocks as is", () => {
  const verse = parseVerse(versePage, 1, "1");
  assert.equal(verse.shloka, "धर्मक्षेत्रे कुरुक्षेत्रे ।\nमामकाः पाण्डवाश्चैव ॥ १ ॥");
  assert.equal(verse.transliteration, "dharma-kṣetre kuru-kṣetre\nmāmakāḥ pāṇḍavāś caiva");
  assert.equal(verse.translation, "Dhṛtarāṣṭra said: O Sañjaya, what did they do?");
  assert.equal(verse.purport, "First paragraph & more.\n\nSecond paragraph.");
  assert.equal(verse.source, "https://vedabase.io/en/library/bg/1/1/");
});

test("parseChapter orders verse links numerically and verifySequence counts grouped verses", () => {
  const page = `<h1>Observing the Armies</h1>
    <a href="/en/library/bg/1/10/">x</a><a href="/en/library/bg/1/1/">x</a>
    <a href="/en/library/bg/1/2-9/">x</a><a href="/en/library/bg/1/1/">dup</a>`;
  const chapter = parseChapter(page, 1);
  assert.equal(chapter.title, "Observing the Armies");
  assert.deepEqual(chapter.slugs, ["1", "2-9", "10"]);
  assert.equal(verifySequence(1, chapter.slugs), 10);
  assert.throws(() => verifySequence(1, ["1", "3"]), /expected verse 2/);
});
