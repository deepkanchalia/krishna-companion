const test = require("node:test");
const assert = require("node:assert/strict");
const { matchesInvocation } = require("../src/voice");

test("matches a complete Krishna or Rama invocation", () => {
  for (const invocation of [
    "hare krishna",
    "Hare Kṛṣṇa",
    "hari krishna",
    "hare krsna",
    "hare krsn",
    "hare rama",
    "Hare Krishna!",
    "  Hare,   Kṛṣṇa.  "
  ]) {
    assert.equal(matchesInvocation(invocation), true, invocation);
  }
});

test("does not match empty, unrelated, or extended prompts", () => {
  for (const prompt of ["hello", "hare krishna please fix the bug", "", "   "]) {
    assert.equal(matchesInvocation(prompt), false, prompt);
  }
});
