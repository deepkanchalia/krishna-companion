const test = require("node:test");
const assert = require("node:assert/strict");
const { reflections } = require("../src/content");

test("the shlokas are sequential, concise and point only to VedaBase", () => {
  assert.ok(reflections.length >= 5);

  for (const [index, reflection] of reflections.entries()) {
    assert.equal(reflection.reference, `Bhagavad-gītā As It Is 1.${index + 1}`);
    assert.match(reflection.reference, /^Bhagavad-gītā As It Is/);
    assert.match(reflection.source, /^https:\/\/vedabase\.io\/en\/library\/bg\//);
    assert.ok(reflection.shloka.length > 20);
    assert.ok(reflection.transliteration.length > 20);
    assert.ok(reflection.translation.split(/\s+/).length <= 25);
    assert.ok(reflection.meaning.split("\n").length <= 2);
  }
});
