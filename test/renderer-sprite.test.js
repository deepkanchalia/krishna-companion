const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { reflections } = require("../src/content");
const Sprite = require("../src/sprite-player");

const combined = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "anim", "manifest.json"), "utf8"));
const manifest = combined.styles[combined.default];

// Drives the shipped renderer with the real manifest and the real sprite planning
// functions, but a recording player, so every phase transition is observable without
// a browser, Electron, or a canvas.
function harness({ reduced = false, hidden = false } = {}) {
  const elements = new Map();
  function element(name) {
    if (!elements.has(name)) {
      const classes = new Set();
      elements.set(name, {
        dataset: {}, attributes: {}, listeners: {}, scrollHeight: 348, style: {},
        classList: {
          add: (...n) => n.forEach((v) => classes.add(v)), remove: (...n) => n.forEach((v) => classes.delete(v)),
          toggle(v, on) { if (on) classes.add(v); else classes.delete(v); }, contains: (v) => classes.has(v)
        },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        setAttribute(key, value) { this.attributes[key] = value; },
        closest: () => null
      });
    }
    return elements.get(name);
  }
  const calls = [];
  const playersCreated = [];
  let currentSegment = null;
  let endCallback = null;
  const player = {
    preload: () => calls.push("preload"),
    play: (name, onEnd) => { calls.push(`play:${name}`); currentSegment = name; endCallback = onEnd; return true; },
    still: (name = "idle", index = Sprite.STILL_FRAME) => { calls.push(`still:${name}:${index}`); currentSegment = null; },
    clear: () => { calls.push("clear"); currentSegment = null; },
    dispose: () => { calls.push("dispose"); currentSegment = null; },
    stop: () => { currentSegment = null; },
    current: () => currentSegment,
    isPlaying: () => currentSegment !== null
  };
  const timers = new Map(); let timerId = 0;
  const bridge = { onShow: null, onCollapse: null, onStyle: null, calls: [] };
  const context = {
    document: {
      querySelector: element, body: element("body"), documentElement: { style: { setProperty() {} } },
      addEventListener() {}, hidden
    },
    window: {
      matchMedia: () => ({ matches: reduced, addEventListener() {} }),
      krishna: {
        resize() {}, ready() {}, expand() { bridge.calls.push("expand"); }, next() {}, dismiss() { bridge.calls.push("dismiss"); }, engage() {}, openSource() {},
        onShow: (fn) => { bridge.onShow = fn; }, onCollapse: (fn) => { bridge.onCollapse = fn; }, onStyle: (fn) => { bridge.onStyle = fn; }, onListening() {}
      },
      KRISHNA_ANIM: manifest,
      KRISHNA_ANIM_STYLES: combined.styles,
      KRISHNA_ANIM_DEFAULT_STYLE: combined.default,
      KrishnaSprite: { ...Sprite, createSpritePlayer: (m) => { playersCreated.push(m.style); return player; } },
      requestAnimationFrame() {}, cancelAnimationFrame() {}, devicePixelRatio: 2
    },
    performance: { now: () => 0 },
    Image: function () { return { addEventListener() {} }; },
    setTimeout: (fn, ms) => { timerId++; timers.set(timerId, { fn, ms }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8"), context);
  return {
    calls, player, bridge, timers, playersCreated, body: element("body"), figureImage: () => element(".figure img"),
    setStyle: (name) => bridge.onStyle(name),
    showStyled: (style) => bridge.onShow({ reflection: reflections[46], durationSeconds: 0, continuing: false, style, arrivalMs: 2200, withdrawalMs: 4000, breathMs: 4000, settleMs: 400, settlePx: 6 }),
    endSegment: () => { const cb = endCallback; const name = currentSegment; currentSegment = null; endCallback = null; if (cb) cb(name); },
    show: (continuing = false) => bridge.onShow({ reflection: reflections[46], durationSeconds: 0, continuing, arrivalMs: 2200, withdrawalMs: 4000, breathMs: 4000, settleMs: 400, settlePx: 6 }),
    collapse: () => bridge.onCollapse(),
    click: (name) => element(name).listeners.click()
  };
}

test("a darshan walks in, stands, teaches on expand, and leaves to absence", () => {
  const h = harness();
  assert.equal(h.calls[0], "preload");
  assert.ok(h.body.classList.contains("sprite"), "sprite mode on");
  h.show();
  assert.equal(h.body.dataset.phase, "arriving");
  assert.equal(h.player.current(), "walkin");
  h.endSegment(); // walk-in finished: message reveals, idle loops
  assert.equal(h.body.dataset.phase, "present");
  assert.equal(h.player.current(), "idle");
  h.click("#expand");
  assert.equal(h.player.current(), Sprite.EXPAND_GESTURE);
  h.endSegment(); // gesture finished: back to idle
  assert.equal(h.player.current(), "idle");
  h.collapse();
  assert.equal(h.body.dataset.phase, "withdrawing");
  assert.equal(h.player.current(), "farewell");
  h.endSegment(); // farewell finished: absent, canvas cleared
  assert.equal(h.body.dataset.phase, "absent");
  assert.equal(h.calls.at(-1), "clear");
  assert.equal(h.player.current(), null);
});

test("the figure style follows the show payload and the style message; unknown names are ignored", () => {
  const h = harness();
  assert.deepEqual(h.playersCreated, [combined.default], "starts on the default style");
  assert.equal(h.body.dataset.style, combined.default, "data-style is set from the start");
  h.showStyled("cartoon");
  assert.equal(h.playersCreated.at(-1), "cartoon", "the show payload selects the cartoon manifest");
  assert.equal(h.body.dataset.style, "cartoon");
  assert.equal(h.player.current(), "walkin");
  h.endSegment();
  h.setStyle("painterly"); // a present darshan switches on the spot and keeps standing
  assert.equal(h.playersCreated.at(-1), "painterly");
  assert.deepEqual(h.calls.slice(-3), ["dispose", "preload", "play:idle"], "the old player is disposed before the new one plays");
  assert.equal(h.player.current(), "idle");
  const before = h.playersCreated.length;
  h.setStyle("nope");
  h.setStyle("painterly");
  assert.equal(h.playersCreated.length, before, "unknown or unchanged styles create no player");
  // A switch during withdrawal waits: the farewell keeps its style (the native window
  // hides on that farewell's clock), and the new style applies once absent.
  h.collapse();
  assert.equal(h.player.current(), "farewell");
  h.setStyle("gyan");
  assert.equal(h.playersCreated.at(-1), "painterly", "no new player while withdrawing");
  assert.equal(h.player.current(), "farewell", "the farewell is not restarted");
  h.endSegment();
  assert.equal(h.body.dataset.phase, "absent");
  assert.equal(h.playersCreated.at(-1), "gyan", "the pending style applies once absent");
  assert.equal(h.body.dataset.style, "gyan");
  assert.equal(h.player.current(), null, "absent draws nothing in the new style");
  // A show that interrupts a farewell (krshna now) arrives in the payload's style at once,
  // and a switch deferred during that farewell is dropped rather than applied later.
  h.showStyled("cartoon"); h.endSegment();
  h.collapse();
  h.setStyle("painterly"); // deferred
  h.showStyled("realistic"); // forced show mid-farewell
  assert.equal(h.body.dataset.style, "realistic", "the forced show's style applies now");
  assert.equal(h.playersCreated.at(-1), "realistic");
  assert.equal(h.player.current(), "walkin");
  h.endSegment();
  h.setStyle("gyan");
  h.collapse(); h.endSegment();
  assert.equal(h.body.dataset.style, "gyan", "the stale deferred style never overrides a later choice");
});

test("with a sprite manifest the fallback still image is never loaded", () => {
  const h = harness();
  assert.equal(h.figureImage().src, undefined, "the 1.4 MB PNG is not fetched when sprites are on");
});

test("a continuing verse keeps the idle loop; nothing re-walks", () => {
  const h = harness();
  h.show(); h.endSegment();
  h.show(true);
  assert.equal(h.player.current(), "idle");
  assert.ok(!h.calls.slice(1).includes("play:walkin") || h.calls.filter((c) => c === "play:walkin").length === 1);
});

test("reduced motion shows one eyes-open still and never plays a segment", () => {
  const h = harness({ reduced: true });
  h.show();
  assert.ok(h.calls.includes(`still:idle:${Sprite.STILL_FRAME}`));
  assert.ok(!h.calls.some((c) => c.startsWith("play:")));
  h.click("#expand");
  assert.ok(!h.calls.some((c) => c.startsWith("play:")), "no gesture under reduced motion");
});

test("a hidden window during withdrawal clears instead of freezing a frame", () => {
  const h = harness({ hidden: true });
  h.show();
  assert.ok(h.calls.includes(`still:idle:${Sprite.STILL_FRAME}`), "hidden arrival draws the still");
  h.collapse();
  assert.equal(h.calls.at(-1), "clear");
  // the slack timer still moves the renderer to absent when the loop cannot finish
  const slack = [...h.timers.values()].find((t) => t.ms > Sprite.durationMs(manifest.segments.farewell));
  assert.ok(slack, "withdraw slack timer armed");
  slack.fn();
  assert.equal(h.body.dataset.phase, "absent");
});
