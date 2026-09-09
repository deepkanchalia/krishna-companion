const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ARRIVAL_MS, WITHDRAWAL_MS, BREATH_MS, SETTLE_MS, SETTLE_PX } = require("../src/darshan");

const rendererSource = fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "../src/index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../src/styles.css"), "utf8");

test("the shipped figure is one original image with no articulated runtime", () => {
  assert.equal((index.match(/<img\b/g) || []).length, 1);
  assert.match(index, /<img src="\.\.\/assets\/krishna\.png"/);
  assert.doesNotMatch(index, /<canvas\b|character-motion|character\.js|character-style/);
});

test("arrival, breathing and withdrawal are single-image transforms driven by CSS variables", () => {
  assert.match(styles, /\[data-phase="arriving"\] \.presence \{ animation: arrive var\(--arrival\)/);
  assert.match(styles, /\[data-phase="withdrawing"\] \.presence \{ animation: withdraw var\(--withdraw\)/);
  assert.match(styles, /animation: breathe var\(--breath\) ease-in-out infinite/);
  assert.match(styles, /@keyframes breathe \{ 0%, 100% \{ transform: scale\(1\); \} 50% \{ transform: scale\(1\.012\); \} \}/);
});

test("styles.css carries no literal s/ms duration for the figure animations", () => {
  // Every declaration that runs a figure animation must read a var(), never a number.
  const declarations = styles.match(/animation: (?:arrive|withdraw|breathe|threshold|settle)[^;]*/g) || [];
  assert.ok(declarations.length >= 4, `expected the figure animation rules, found ${declarations.length}`);
  for (const decl of declarations) {
    assert.match(decl, /var\(--(arrival|withdraw|breath|settle)\)/, `no variable in: ${decl}`);
    assert.doesNotMatch(decl, /\d+\s*m?s\b/, `literal duration in: ${decl}`);
  }
});

test("the companion:show handler sets the darshan timing variables from src/darshan.js", () => {
  const recorded = {};
  const noop = () => {};
  const el = () => ({
    dataset: {}, attributes: {}, listeners: {}, scrollHeight: 100, scrollTop: 0, inert: false,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, setAttribute: noop, closest: () => null
  });
  const callbacks = {};
  const context = {
    document: {
      querySelector: el,
      body: el(),
      documentElement: { style: { setProperty: (key, value) => { recorded[key] = value; } } },
      addEventListener: (type, fn) => { callbacks[type] = fn; }
    },
    window: {
      matchMedia: () => ({ matches: false }),
      krishna: {
        resize: noop, ready: noop, dismiss: noop, expand: noop, engage: noop, next: noop,
        openSource: noop, onShow: (fn) => { callbacks.show = fn; }, onCollapse: noop, onListening: noop
      }
    },
    setTimeout: () => 0,
    clearTimeout: noop
  };
  vm.runInNewContext(rendererSource, context);
  callbacks.show({
    reflection: { translation: "t", meaning: "m", reference: "Bhagavad-gītā As It Is 2.47", chapter: "c", source: "s" },
    durationSeconds: 0,
    arrivalMs: ARRIVAL_MS,
    withdrawalMs: WITHDRAWAL_MS,
    breathMs: BREATH_MS,
    settleMs: SETTLE_MS,
    settlePx: SETTLE_PX
  });
  assert.deepEqual(recorded, {
    "--arrival": `${ARRIVAL_MS}ms`,
    "--withdraw": `${WITHDRAWAL_MS}ms`,
    "--breath": `${BREATH_MS}ms`,
    "--settle": `${SETTLE_MS}ms`,
    "--settle-px": `${SETTLE_PX}px`
  });
});

test("the renderer runs no requestAnimationFrame loop, so nothing animates while absent", () => {
  assert.doesNotMatch(rendererSource, /requestAnimationFrame/);
  assert.doesNotMatch(rendererSource, /setInterval/);
});

test("absence and reduced motion have no breathing loop", () => {
  const breathingRule = styles.match(/body\[data-phase="arriving"\][^\n]+animation: breathe[^\n]+/)[0];
  assert.doesNotMatch(breathingRule, /data-phase="absent"|data-phase="withdrawing"/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]+animation: none; transform: scale\(1\);/);
});
