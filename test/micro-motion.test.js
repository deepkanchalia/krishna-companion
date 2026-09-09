const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ARRIVAL_MS, WITHDRAWAL_MS } = require("../src/darshan");

const index = fs.readFileSync(path.join(__dirname, "../src/index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../src/styles.css"), "utf8");

test("the shipped figure is one original image with no articulated runtime", () => {
  assert.equal((index.match(/<img\b/g) || []).length, 1);
  assert.match(index, /<img src="\.\.\/assets\/krishna\.png"/);
  assert.doesNotMatch(index, /<canvas\b|character-motion|character\.js|character-style/);
});

test("arrival, breathing and withdrawal use bounded single-image transforms", () => {
  assert.equal(ARRIVAL_MS, 1_100);
  assert.equal(WITHDRAWAL_MS, 900);
  assert.match(styles, /\[data-phase="arriving"\] \.presence \{ animation: arrive \.95s/);
  assert.match(styles, /\[data-phase="withdrawing"\] \.presence \{ animation: withdraw \.85s/);
  assert.match(styles, /animation: breathe 4s ease-in-out infinite/);
  assert.match(styles, /@keyframes breathe \{ 0%, 100% \{ transform: scale\(1\); \} 50% \{ transform: scale\(1\.012\); \} \}/);
});

test("absence and reduced motion have no breathing loop", () => {
  const breathingRule = styles.match(/body\[data-phase="arriving"\][^\n]+animation: breathe[^\n]+/)[0];
  assert.doesNotMatch(breathingRule, /data-phase="absent"|data-phase="withdrawing"/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]+animation: none; transform: scale\(1\);/);
  assert.doesNotMatch(styles, /requestAnimationFrame|setInterval/);
});
