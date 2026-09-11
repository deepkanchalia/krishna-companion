const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ARRIVAL_MS, WITHDRAWAL_MS, BREATH_MS, SETTLE_MS, SETTLE_PX } = require("../src/darshan");

const rendererSource = fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8");

// The renderer is the only place darshan durations enter the DOM: it turns the
// companion:show payload (src/darshan.js) into the --arrival/--withdraw/--breath/
// --settle/--settle-px CSS custom properties that styles.css reads. This drives the
// renderer with a recording documentElement.style and asserts the mapping by behaviour,
// not by reading styles.css. Here no window.KRISHNA_ANIM is provided, so the sprite
// player is absent and the CSS fallback path (applyMotionTimings) sets the variables.
//
// The figure's motion states themselves (walk-in, idle, teach, farewell, reduced-motion
// still, absence clearing the canvas) are proven behaviourally in test/renderer-sprite.test.js;
// the per-frame walk-in/farewell placement is proven in test/sprite-player.test.js.
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
