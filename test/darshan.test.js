const test = require("node:test");
const assert = require("node:assert/strict");
const { createDarshan, ARRIVAL_MS, WITHDRAWAL_MS, UNTOUCHED_MS } = require("../src/darshan");

function harness() {
  let now = 0;
  const timers = new Map();
  const events = [];
  const darshan = createDarshan({
    onWithdraw: () => events.push("withdraw"),
    onAbsent: () => events.push("absent"),
    schedule(fn, ms) { const token = {}; timers.set(token, { fn, at: now + ms }); return token; },
    cancel: (token) => timers.delete(token)
  });
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].fn();
    }
    now = end;
  }
  return { darshan, events, advance, timers };
}

test("untouched verse stays three minutes after arrival then fully withdraws", () => {
  const h = harness();
  h.darshan.show();
  h.advance(ARRIVAL_MS + UNTOUCHED_MS - 1);
  assert.deepEqual(h.events, []);
  h.advance(1);
  assert.deepEqual(h.events, ["withdraw"]);
  assert.equal(h.darshan.show(), false, "cannot start another verse during withdrawal");
  h.advance(WITHDRAWAL_MS);
  assert.equal(h.darshan.phase, "absent");
  assert.deepEqual(h.events, ["withdraw", "absent"]);
  assert.equal(h.timers.size, 0);
});

test("expanding cancels even an explicit short duration until the reader closes", () => {
  const h = harness();
  h.darshan.show(2);
  h.advance(ARRIVAL_MS);
  h.darshan.expand();
  h.advance(UNTOUCHED_MS * 10);
  assert.deepEqual(h.events, []);
  h.darshan.withdraw();
  h.darshan.withdraw();
  h.advance(WITHDRAWAL_MS);
  assert.deepEqual(h.events, ["withdraw", "absent"], "double dismissal hides exactly once");
});

test("next verse replaces the previous timeout and reset cancels stale withdrawal", () => {
  const h = harness();
  h.darshan.show(2);
  h.advance(ARRIVAL_MS + 1500);
  h.darshan.show(10);
  h.advance(1000);
  assert.deepEqual(h.events, []);
  h.darshan.withdraw();
  h.darshan.reset();
  h.darshan.show();
  h.advance(WITHDRAWAL_MS);
  assert.deepEqual(h.events, ["withdraw"], "old window cannot hide the recreated encounter");
});
