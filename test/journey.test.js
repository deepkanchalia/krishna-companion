const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeJourney, recordTeaching } = require("../src/journey");

const reflection = {
  reference: "Bhagavad-gītā As It Is 1.1",
  translation: "A short excerpt.",
  meaning: "A concise explanation.",
  source: "https://vedabase.io/en/library/bg/1/1/"
};

test("normalizes missing and out-of-range sequence state", () => {
  assert.equal(normalizeJourney(null, 8).nextVerseIndex, 0);
  assert.equal(normalizeJourney({ nextVerseIndex: 10 }, 8).nextVerseIndex, 2);
});

test("records exactly what was explained and advances in order", () => {
  const journey = normalizeJourney(null, 8);
  const updated = recordTeaching(journey, 0, reflection, "2026-09-04T00:00:00.000Z", 8);
  assert.equal(updated.nextVerseIndex, 1);
  assert.deepEqual(updated.history[0], {
    reference: reflection.reference,
    translation: reflection.translation,
    explanation: reflection.meaning,
    source: reflection.source,
    shownAt: "2026-09-04T00:00:00.000Z"
  });
});

test("caps saved context at 100 teachings and counts completed cycles", () => {
  let journey = normalizeJourney(null, 2);
  for (let index = 0; index < 102; index += 1) {
    journey = recordTeaching(journey, index % 2, reflection, String(index), 2);
  }
  assert.equal(journey.history.length, 100);
  assert.equal(journey.completedCycles, 51);
});
