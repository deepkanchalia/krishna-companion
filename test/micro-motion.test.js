const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ARRIVAL_MS, WITHDRAWAL_MS, BREATH_MS, SETTLE_MS, SETTLE_PX } = require("../src/darshan");

const rendererSource = fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "../src/index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../src/styles.css"), "utf8");

test("the figure is one original still plus a flipbook of generated frames; no cut-out rig", () => {
  assert.equal((index.match(/<img\b/g) || []).length, 1);
  assert.match(index, /<img src="\.\.\/assets\/krishna\.png"/);
  assert.equal((index.match(/<canvas class="sprite"/g) || []).length, 1);
  assert.match(index, /<script src="\.\.\/assets\/anim\/manifest\.js">/);
  assert.match(index, /<script src="sprite-player\.js">/);
  // Motion comes only from video frames of one identity, never from rotated parts.
  assert.doesNotMatch(index, /character-motion|character\.js|character-style/);
  assert.doesNotMatch(rendererSource, /character-motion|rotate\(|ribbon/);
});

test("arrival, breathing and withdrawal are single-image transforms driven by CSS variables", () => {
  assert.match(styles, /\[data-phase="arriving"\] \.presence \{ animation: arrive var\(--arrival\)/);
  assert.match(styles, /\[data-phase="withdrawing"\] \.presence \{ animation: withdraw var\(--withdraw\)/);
  assert.match(styles, /animation: breathe var\(--breath\) ease-in-out infinite/);
  assert.match(styles, /@keyframes breathe \{ 0%, 100% \{ transform: scale\(1\); \} 50% \{ transform: scale\(1\.012\); \} \}/);
});

test("a one-shot settle bob plays on arrival, driven by the settle variables", () => {
  // 6 px ease-out over SETTLE_MS on the presence layer once the phase becomes present.
  assert.match(styles, /body:not\(\.continuing\)\[data-phase="present"\] \.presence \{ animation: settle var\(--settle\) ease-out both; \}/);
  assert.match(styles, /@keyframes settle \{ from \{ transform: translateY\(var\(--settle-px\)\); \} to \{ transform: translateY\(0\); \} \}/);
  // One-shot: the settle animation must never loop.
  const settleRule = styles.match(/animation: settle[^;]*/)[0];
  assert.doesNotMatch(settleRule, /infinite/);
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

test("the only frame loop is the sprite player's, and it is cleared while absent", () => {
  // The renderer hands requestAnimationFrame to the player once, in the env it builds;
  // it never runs a loop of its own, and absence clears the player (test/sprite-player.test.js
  // proves the player requests no frames after stop/clear).
  assert.equal((rendererSource.match(/requestAnimationFrame/g) || []).length, 1);
  assert.match(rendererSource, /raf: \(fn\) => window\.requestAnimationFrame\(fn\)/);
  assert.doesNotMatch(rendererSource, /setInterval/);
  assert.match(rendererSource, /if \(phase === "absent"\) \{ player\.clear\(\); return; \}/);
  // The still is the player's default eyes-open frame (STILL_FRAME), never frame 0.
  assert.match(rendererSource, /if \(document\.hidden \|\| reducedMotion\.matches\) \{ player\.still\(\); return; \}/);
  assert.doesNotMatch(rendererSource, /still\("idle", 0\)/);
  assert.match(rendererSource, /player\.preload\(\)/);
  assert.match(rendererSource, /if \(name === "farewell"\) \{ if \(phase === "withdrawing"\) setAbsent\(\)/);
});

test("absence and reduced motion have no breathing loop, and reduced motion disables the settle", () => {
  const breathingRule = styles.match(/body\[data-phase="arriving"\][^\n]+animation: breathe[^\n]+/)[0];
  assert.doesNotMatch(breathingRule, /data-phase="absent"|data-phase="withdrawing"/);
  const reduced = styles.match(/prefers-reduced-motion: reduce[\s\S]+?\n\}/)[0];
  assert.match(reduced, /animation: none; transform: scale\(1\);/);
  // The one-shot settle (on the present presence layer) is disabled under reduced motion.
  assert.match(reduced, /body:not\(\.continuing\)\[data-phase="present"\] \.presence \{ animation: none; \}/);
});

test("the arrive and withdraw keyframes slide the figure along X from the right edge", () => {
  const arrive = styles.match(/@keyframes arrive \{[^\n]*/)[0];
  // Arrival starts off to the right (positive translateX) and lands at rest (no transform).
  assert.match(arrive, /0% \{[^}]*transform: translateX\((\d+)px\)/);
  assert.equal(Number(arrive.match(/0% \{[^}]*transform: translateX\((\d+)px\)/)[1]) > 0, true);
  assert.match(arrive, /100% \{[^}]*transform: none/);

  const withdraw = styles.match(/@keyframes withdraw \{[^\n]*/)[0];
  // Withdrawal leaves from rest back off to the right (positive translateX at the end).
  assert.match(withdraw, /transform: none/);
  assert.match(withdraw, /100% \{[^}]*transform: translateX\((\d+)px\)/);
  assert.equal(Number(withdraw.match(/100% \{[^}]*transform: translateX\((\d+)px\)/)[1]) > 0, true);
});
