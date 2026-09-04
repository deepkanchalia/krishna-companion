const test = require("node:test");
const assert = require("node:assert/strict");
const { canShowTeaching } = require("../src/schedule");

test("an open card blocks the next scheduled teaching", () => {
  assert.equal(canShowTeaching({ paused: false, isExpanded: true }), false);
});

test("manual invocation bypasses pause but never replaces an open card", () => {
  assert.equal(canShowTeaching({ paused: true, isExpanded: false, force: true }), true);
  assert.equal(canShowTeaching({ paused: true, isExpanded: true, force: true }), false);
});
