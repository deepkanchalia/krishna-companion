const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileCadence } = require("../src/cadence");

const INTERVAL = 30 * 60 * 1000; // 30 minutes in ms

test("due after a long sleep: fires exactly once and advances by ONE interval, never N", () => {
  // now is six intervals past the scheduled time (a three-hour sleep on a 30-min cadence).
  const now = 1_000_000;
  const nextReflectionAt = now - 6 * INTERVAL;
  const decision = reconcileCadence({ now, nextReflectionAt, intervalMs: INTERVAL, paused: false, isExpanded: false });
  assert.equal(decision.due, true, "one darshan is due on wake");
  assert.equal(decision.nextReflectionAt, now + INTERVAL, "the schedule advances one interval from now, not six");
  // A second reconcile at the same instant is not due again: the advance means one fire only.
  const again = reconcileCadence({ now, nextReflectionAt: decision.nextReflectionAt, intervalMs: INTERVAL, paused: false, isExpanded: false });
  assert.equal(again.due, false, "the storm of missed intervals collapses to a single darshan");
});

test("not yet due: never fires and leaves the schedule unchanged", () => {
  const now = 1_000_000;
  const nextReflectionAt = now + 5 * 60 * 1000; // five minutes out
  const decision = reconcileCadence({ now, nextReflectionAt, intervalMs: INTERVAL, paused: false, isExpanded: false });
  assert.equal(decision.due, false);
  assert.equal(decision.nextReflectionAt, nextReflectionAt, "an early reconcile does not move the schedule");
});

test("paused: never fires even when past due, and holds the schedule for later", () => {
  const now = 1_000_000;
  const nextReflectionAt = now - INTERVAL; // past due
  const decision = reconcileCadence({ now, nextReflectionAt, intervalMs: INTERVAL, paused: true, isExpanded: false });
  assert.equal(decision.due, false, "a paused loop never fires");
  assert.equal(decision.nextReflectionAt, nextReflectionAt, "the past-due time is held, not dropped, so it fires once when resumed");
  // When the pause clears, the very next reconcile fires exactly once.
  const resumed = reconcileCadence({ now, nextReflectionAt: decision.nextReflectionAt, intervalMs: INTERVAL, paused: false, isExpanded: false });
  assert.equal(resumed.due, true, "the held teaching fires once as soon as the pause clears");
  assert.equal(resumed.nextReflectionAt, now + INTERVAL, "and then advances one interval");
});

test("expanded (a teaching open): never fires and holds the schedule until the card closes", () => {
  const now = 1_000_000;
  const nextReflectionAt = now - INTERVAL; // past due
  const decision = reconcileCadence({ now, nextReflectionAt, intervalMs: INTERVAL, paused: false, isExpanded: true });
  assert.equal(decision.due, false, "the sequence never advances behind an open card");
  assert.equal(decision.nextReflectionAt, nextReflectionAt, "the past-due time is held for when the card closes");
});

test("first arm: a missing/non-finite nextReflectionAt arms one interval ahead without firing", () => {
  const now = 1_000_000;
  for (const value of [undefined, null, NaN, Infinity]) {
    const decision = reconcileCadence({ now, nextReflectionAt: value, intervalMs: INTERVAL, paused: false, isExpanded: false });
    assert.equal(decision.due, false, `nextReflectionAt=${String(value)} does not fire`);
    assert.equal(decision.nextReflectionAt, now + INTERVAL, `nextReflectionAt=${String(value)} arms one interval ahead`);
  }
});
