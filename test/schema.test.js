const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MIN_HOLD_MS,
  MAX_HOLD_MS,
  isTrueFlag,
  safeVerseIndex,
  boundedInterval,
  boundedHoldMs,
  validRestingPosition,
  normalizeSettings
} = require("../src/schema");
const { INTERVAL_MINUTES_MIN, INTERVAL_MINUTES_MAX } = require("../src/config");
const { DEFAULT_VOICE_SETTINGS } = require("../src/voice-hold");

test("isTrueFlag is true only for the literal boolean true (C7)", () => {
  assert.equal(isTrueFlag(true), true);
  for (const value of ["true", 1, {}, [], "false", 0, null, undefined, "1"]) {
    assert.equal(isTrueFlag(value), false, `${JSON.stringify(value)} must not read as true`);
  }
});

test("safeVerseIndex keeps a finite integer and falls back otherwise", () => {
  assert.equal(safeVerseIndex(5), 5);
  assert.equal(safeVerseIndex(0), 0);
  assert.equal(safeVerseIndex(-3), -3, "range wrapping is normalizeJourney's job, not this guard's");
  assert.equal(safeVerseIndex(1.5), 0);
  assert.equal(safeVerseIndex(NaN), 0);
  assert.equal(safeVerseIndex("7"), 0);
  assert.equal(safeVerseIndex(undefined, 3), 3, "the fallback is returned for a non-integer");
  assert.equal(safeVerseIndex(null, undefined), undefined, "the fallback may be undefined (CLI context)");
});

test("boundedInterval clamps to the config range and fails closed to the fallback", () => {
  assert.equal(boundedInterval(30, 15), 30);
  assert.equal(boundedInterval(INTERVAL_MINUTES_MIN, 15), INTERVAL_MINUTES_MIN);
  assert.equal(boundedInterval(INTERVAL_MINUTES_MAX, 15), INTERVAL_MINUTES_MAX);
  assert.equal(boundedInterval(INTERVAL_MINUTES_MIN - 0.01, 15), 15, "below the floor fails closed");
  assert.equal(boundedInterval(INTERVAL_MINUTES_MAX + 1, 15), 15, "above the ceiling fails closed");
  assert.equal(boundedInterval("30", 15), 15, "a string fails closed");
  assert.equal(boundedInterval(undefined, 15), 15);
  assert.equal(boundedInterval(NaN, 15), 15);
});

test("boundedHoldMs enforces [MIN, MAX] and defaults out of range", () => {
  assert.equal(boundedHoldMs(2000), 2000);
  assert.equal(boundedHoldMs(MIN_HOLD_MS), MIN_HOLD_MS);
  assert.equal(boundedHoldMs(MAX_HOLD_MS), MAX_HOLD_MS);
  assert.equal(boundedHoldMs(MIN_HOLD_MS - 1), DEFAULT_VOICE_SETTINGS.holdMs);
  assert.equal(boundedHoldMs(MAX_HOLD_MS + 1), DEFAULT_VOICE_SETTINGS.holdMs);
  assert.equal(boundedHoldMs("2000"), DEFAULT_VOICE_SETTINGS.holdMs);
  assert.equal(boundedHoldMs(NaN), DEFAULT_VOICE_SETTINGS.holdMs);
  assert.equal(boundedHoldMs(NaN, 500), 500, "an explicit fallback is honoured");
});

test("validRestingPosition accepts only two finite coordinates", () => {
  assert.deepEqual(validRestingPosition({ restingPosition: { x: 10, y: 20 } }), { x: 10, y: 20 });
  assert.equal(validRestingPosition({ restingPosition: { x: 10 } }), undefined);
  assert.equal(validRestingPosition({ restingPosition: { x: "10", y: 20 } }), undefined);
  assert.equal(validRestingPosition({ restingPosition: { x: NaN, y: 20 } }), undefined);
  assert.equal(validRestingPosition({}), undefined);
  assert.equal(validRestingPosition(null), undefined, "a wrong-shape settings object is treated as absent");
  assert.equal(validRestingPosition([]), undefined);
});

test("normalizeSettings fails closed on a wrong-shape file to the defaults", () => {
  for (const bad of [null, [], "x", 42, undefined]) {
    const settings = normalizeSettings(bad);
    assert.equal(settings.version, 1);
    assert.equal(settings.voice.enabled, false, "voice off by default");
    assert.equal(settings.voice.holdMs, DEFAULT_VOICE_SETTINGS.holdMs);
    assert.equal(settings.figure.style, "realistic");
  }
});

test("normalizeSettings enables voice only for a literal true and validates every voice field", () => {
  const enabled = normalizeSettings({ voice: { enabled: true } });
  assert.equal(enabled.voice.enabled, true);
  assert.equal(normalizeSettings({ voice: { enabled: "true" } }).voice.enabled, false);
  assert.equal(normalizeSettings({ voice: { enabled: 1 } }).voice.enabled, false);

  // holdMs out of range falls back; a valid one survives.
  assert.equal(normalizeSettings({ voice: { holdMs: 99999 } }).voice.holdMs, DEFAULT_VOICE_SETTINGS.holdMs);
  assert.equal(normalizeSettings({ voice: { holdMs: 1500 } }).voice.holdMs, 1500);

  // An unknown figure style is coerced to the default; a known one survives.
  assert.equal(normalizeSettings({ figure: { style: "attacker" } }).figure.style, "realistic");
  assert.equal(normalizeSettings({ figure: { style: "warrior" } }).figure.style, "warrior");

  // A non-object voice member is treated as absent, leaving the defaults.
  assert.equal(normalizeSettings({ voice: "on" }).voice.enabled, false);
});

test("normalizeSettings preserves an unrelated saved key it does not own", () => {
  const settings = normalizeSettings({ restingPosition: { x: 1, y: 2 }, voice: { enabled: true } });
  assert.deepEqual(settings.restingPosition, { x: 1, y: 2 });
});
