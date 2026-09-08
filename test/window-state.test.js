const test = require("node:test");
const assert = require("node:assert/strict");
const { resetOnWindowClosed } = require("../src/window-state");

test("closing the window clears expansion so a recreated window can show a teaching", () => {
  const next = resetOnWindowClosed({ isExpanded: true, dismissTimer: 123 });
  assert.equal(next.isExpanded, false, "expansion is cleared");
  assert.equal(next.dismissTimer, undefined, "the per-card timer is dropped");
});

test("it leaves unrelated state alone and is safe on empty input", () => {
  assert.deepEqual(resetOnWindowClosed({ paused: true, isExpanded: true, dismissTimer: 1 }), {
    paused: true,
    isExpanded: false,
    dismissTimer: undefined
  });
  assert.deepEqual(resetOnWindowClosed(), { isExpanded: false, dismissTimer: undefined });
});
