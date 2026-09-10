const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { reflections } = require("../src/content");

// Run the shipped event handlers with a minimal DOM and IPC bridge. No browser,
// Electron, native hooks or persistent state are started by the test suite.
function harness(reduced = false) {
  const elements = new Map();
  function element(name) {
    if (!elements.has(name)) {
      const classes = new Set();
      elements.set(name, {
        dataset: {}, attributes: {}, listeners: {}, scrollHeight: 348,
        classList: {
          add: (...names) => names.forEach((value) => classes.add(value)),
          remove: (...names) => names.forEach((value) => classes.delete(value)),
          toggle(value, on) { if (on) classes.add(value); else classes.delete(value); },
          contains: (value) => classes.has(value)
        },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        setAttribute(key, value) { this.attributes[key] = value; },
        closest: () => null
      });
    }
    return elements.get(name);
  }
  const events = [];
  const callbacks = {};
  const timers = new Map();
  const context = {
    document: {
      querySelector: element,
      body: element("body"),
      documentElement: { style: { setProperty() {} } },
      addEventListener: (type, fn) => { callbacks[type] = fn; }
    },
    window: {
      matchMedia: () => ({ matches: reduced }),
      krishna: {
        resize: () => {},
        ready: () => {},
        dismiss: () => events.push("dismiss"),
        expand: () => events.push("expand"),
        engage: () => events.push("engage"),
        next: () => events.push("next"),
        openSource: (url) => events.push(url),
        onShow: (fn) => { callbacks.show = fn; },
        onCollapse: (fn) => { callbacks.collapse = fn; },
        onListening: () => {}
      }
    },
    setTimeout(fn, ms) { const token = {}; timers.set(token, { fn, ms }); return token; },
    clearTimeout: (token) => timers.delete(token)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8"), context);
  return { element, events, callbacks, timers,
    show: (reflection = reflections[0], options = {}) => callbacks.show({ reflection, durationSeconds: 0, ...options }),
    reveal() { for (const [token, timer] of [...timers]) { timers.delete(token); timer.fn(); } },
    click: (selector) => element(selector).listeners.click(),
    key: (key, target = element("body")) => callbacks.keydown({ key, target, preventDefault() {} })
  };
}

test("every corpus entry reaches the renderer verbatim, with correct source and no invented purport", () => {
  const h = harness();
  for (const reflection of reflections) {
    h.show(reflection); h.reveal(); h.click("#expand");
    assert.equal(h.element("#translation").textContent, reflection.translation);
    assert.equal(h.element("#meaning").textContent, reflection.meaning);
    assert.equal(h.element("#purport").hidden, !reflection.meaning);
    h.click("#source");
    assert.equal(h.events.at(-1), reflection.source);
  }
});

test("tap and Enter both expand, while Enter on a button preserves its native action", () => {
  const h = harness();
  h.show(); h.reveal(); h.click("#translation");
  assert.deepEqual(h.events, ["expand"]);
  h.show(); h.key("Enter");
  assert.deepEqual(h.events, ["expand", "expand"]);
  h.show(); h.key("Enter", { closest: () => ({ tagName: "BUTTON" }) });
  assert.equal(h.events.length, 2);
});

test("closing during arrival cancels the reveal and makes the card inert", () => {
  const h = harness();
  h.show(); h.key("Escape"); h.reveal();
  assert.equal(h.element("body").dataset.phase, "withdrawing");
  assert.equal(h.element(".card").inert, true);
  assert.deepEqual(h.events, ["dismiss"]);
});

test("next is single-flight, preview disables progression, and reduced motion reveals immediately", () => {
  const h = harness(true);
  h.show();
  assert.equal([...h.timers.values()][0].ms, 0);
  h.reveal(); h.click("#next"); h.click("#next");
  assert.deepEqual(h.events, ["next"]);
  h.show(reflections[0], { preview: true });
  assert.equal(h.element("#next").hidden, true);
});
