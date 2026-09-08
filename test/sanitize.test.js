const test = require("node:test");
const assert = require("node:assert/strict");
const { safeLabel } = require("../src/sanitize");

test("safeLabel strips control characters and caps the length", () => {
  assert.equal(safeLabel("abc\nFORGED"), "abcFORGED", "newline dropped, no log injection");
  assert.equal(safeLabel("a\tb\r\ncd"), "abcd", "tab, CR, BEL and DEL dropped");
  assert.equal(safeLabel("x".repeat(100)).length, 40, "capped at 40 by default");
  assert.equal(safeLabel("देव2.47"), "देव2.47", "ordinary Unicode preserved");
  assert.equal(safeLabel(undefined), "undefined", "non-strings are coerced, not thrown on");
});
