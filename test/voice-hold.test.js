const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { observeHold, normalizeVoiceKey, DEFAULT_VOICE_SETTINGS } = require("../src/voice-hold");

const SPACE = 57;
const LETTER_A = 30;

function holdHarness({ frontmost = true } = {}) {
  const events = new EventEmitter();
  let timestamp = 0;
  let triggered = 0;
  let released = 0;
  let nextTimer = 1;
  const timers = new Map();

  const observer = observeHold({
    eventSource: events,
    triggerKey: SPACE,
    holdMs: 2_000,
    now: () => timestamp,
    schedule(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, dueAt: timestamp + delay });
      return id;
    },
    cancelSchedule: (id) => timers.delete(id),
    isFrontmostAllowed: () => frontmost,
    onTrigger: () => { triggered += 1; },
    onRelease: () => { released += 1; }
  });

  function advanceTo(nextTimestamp) {
    timestamp = nextTimestamp;
    for (const [id, timer] of [...timers]) {
      if (timer.dueAt <= timestamp) {
        timers.delete(id);
        timer.callback();
      }
    }
  }

  return {
    events,
    advanceTo,
    counts: () => ({ triggered, released }),
    stop: observer.stop
  };
}

test("a 1999 ms hold does not fire", () => {
  const harness = holdHarness();
  harness.events.emit("keydown", { keycode: SPACE });
  harness.advanceTo(1_999);
  harness.events.emit("keyup", { keycode: SPACE });
  assert.deepEqual(harness.counts(), { triggered: 0, released: 0 });
});

test("a 2000 ms hold fires and keyup releases", () => {
  const harness = holdHarness();
  harness.events.emit("keydown", { keycode: SPACE });
  harness.advanceTo(2_000);
  assert.deepEqual(harness.counts(), { triggered: 1, released: 0 });
  harness.events.emit("keyup", { keycode: SPACE });
  assert.deepEqual(harness.counts(), { triggered: 1, released: 1 });
});

test("a second key during the hold cancels it", () => {
  const harness = holdHarness();
  harness.events.emit("keydown", { keycode: SPACE });
  harness.advanceTo(1_000);
  harness.events.emit("keydown", { keycode: LETTER_A });
  harness.advanceTo(2_000);
  assert.equal(harness.counts().triggered, 0);
});

test("OS key-repeat does not reset the hold timer", () => {
  const harness = holdHarness();
  harness.events.emit("keydown", { keycode: SPACE });
  harness.advanceTo(1_500);
  harness.events.emit("keydown", { keycode: SPACE, repeat: true });
  harness.advanceTo(2_000);
  assert.equal(harness.counts().triggered, 1);
});

test("a disallowed frontmost app blocks the hold", () => {
  const harness = holdHarness({ frontmost: false });
  harness.events.emit("keydown", { keycode: SPACE });
  harness.advanceTo(2_000);
  assert.equal(harness.counts().triggered, 0);
});

test("normalizeVoiceKey accepts only allow-listed keys and never passes untrusted text through", () => {
  assert.equal(normalizeVoiceKey("Space"), "Space");
  assert.equal(normalizeVoiceKey("F5"), "F5");
  // Anything not on the fixed allow-list falls back to the default, so no arbitrary
  // settings.json string can reach the hook or a notice (C3).
  assert.equal(normalizeVoiceKey("Enter"), DEFAULT_VOICE_SETTINGS.key);
  assert.equal(normalizeVoiceKey("<script>alert(1)</script>"), DEFAULT_VOICE_SETTINGS.key);
  assert.equal(normalizeVoiceKey(""), DEFAULT_VOICE_SETTINGS.key);
  assert.equal(normalizeVoiceKey(undefined), DEFAULT_VOICE_SETTINGS.key);
  assert.equal(normalizeVoiceKey(42), DEFAULT_VOICE_SETTINGS.key);
});
