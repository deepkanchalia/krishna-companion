const test = require("node:test");
const assert = require("node:assert/strict");
const { containsInvocation, matchesInvocation } = require("../src/voice");

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

test("finds an invocation inside a running transcript", () => {
  for (const transcript of [
    "so hare krishna",
    "hare kṛṣṇa hare krishna krishna krishna",
    "please, Hari Rama, thank you"
  ]) {
    assert.equal(containsInvocation(transcript), true, transcript);
  }
});

test("does not find an invocation across partial words or unrelated transcripts", () => {
  for (const transcript of ["share krishna", "hare", "krishna", "harerama", "hello there", null]) {
    assert.equal(containsInvocation(transcript), false, String(transcript));
  }
});
