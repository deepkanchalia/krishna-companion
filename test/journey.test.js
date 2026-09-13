const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeJourney, recordTeaching, isValidHistoryEntry } = require("../src/journey");

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

test("drops corrupt history entries while keeping readable ones", () => {
  const saved = {
    nextVerseIndex: 1,
    history: [
      { reference: "Bhagavad-gītā As It Is 1.1", explanation: "Readable.", translation: "t", source: "s" },
      null,
      "not an object",
      { reference: 123, explanation: "non-string reference" },
      { reference: "Bhagavad-gītā As It Is 1.2" }
    ]
  };
  const normalized = normalizeJourney(saved, 8);
  assert.equal(normalized.history.length, 1);
  assert.equal(normalized.history[0].reference, "Bhagavad-gītā As It Is 1.1");
  assert.equal(isValidHistoryEntry(saved.history[0]), true);
  assert.equal(isValidHistoryEntry(null), false);
  assert.equal(isValidHistoryEntry(saved.history[3]), false);
});

test("nextVerseIndex fails closed to 0 when neither saved nor fallback is a finite integer", () => {
  // A hand-edited or truncated state.json can hand a non-integer through as the fallback
  // index; it must never reach the modulo as NaN and leave nextVerseIndex undefined/NaN.
  assert.equal(normalizeJourney(null, 8, "abc").nextVerseIndex, 0);
  assert.equal(normalizeJourney(null, 8, NaN).nextVerseIndex, 0);
  assert.equal(normalizeJourney(null, 8, 1.5).nextVerseIndex, 0);
  assert.equal(normalizeJourney({ nextVerseIndex: "7" }, 8, "bad").nextVerseIndex, 0, "a garbage saved value with a garbage fallback still yields 0");
  // A wrong-typed saved value falls back to a valid integer fallback (state.nextVerseIndex).
  assert.equal(normalizeJourney({ nextVerseIndex: "7" }, 8, 3).nextVerseIndex, 3);
  // A negative saved integer still wraps into range, never a negative index.
  assert.equal(normalizeJourney({ nextVerseIndex: -1 }, 8).nextVerseIndex, 7);
});

test("caps saved context at 100 teachings and counts completed cycles", () => {
  let journey = normalizeJourney(null, 2);
  for (let index = 0; index < 102; index += 1) {
    journey = recordTeaching(journey, index % 2, reflection, String(index), 2);
  }
  assert.equal(journey.history.length, 100);
  assert.equal(journey.completedCycles, 51);
});
