const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const motion = require("../src/character-motion");

async function harness(reduced = false) {
  let now = 0;
  let sequence = 0;
  const frames = new Map();
  const calls = [];
  const listeners = {};
  const context2d = {
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    scale(x, y) { calls.push(["scale", x, y]); },
    drawImage() {}, beginPath() {}, ellipse() {}, fill() {}, fillRect() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 255, 255]) }),
    putImageData() {}
  };
  function element() { return { width: 640, height: 920, dataset: {}, addEventListener() {}, getContext: () => context2d }; }
  const canvas = element();
  const elements = new Map([["#krishna-character", canvas], ["#character-style", element()], ["#character-status", element()]]);
  const media = { matches: reduced, addEventListener: (_event, fn) => { listeners.motion = fn; } };
  const document = { hidden: false, body: element(), querySelector: (id) => elements.get(id), createElement: element,
    addEventListener: (event, fn) => { listeners[event] = fn; } };
  const window = { KrishnaMotion: motion, matchMedia: () => media,
    addEventListener: (event, fn) => { listeners[event] = fn; } };
  const context = { window, document, performance: { now: () => now },
    localStorage: { getItem: () => null, setItem() {} },
    Image: class { set src(value) { Promise.resolve().then(() => this.onload()); } },
    requestAnimationFrame(fn) { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/character.js"), "utf8"), context);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  return { player: window.krishnaCharacter, canvas, calls, frames, document, media, listeners,
    advance(ms) { now += ms; for (const [id, fn] of [...frames]) { frames.delete(id); fn(now); } } };
}

test("actual character renderer uses positive scale throughout arrival, gestures and departure", async () => {
  const h = await harness();
  for (const action of ["arriving", "teach", "explain", "withdrawing"]) {
    h.player.play(action);
    for (let i = 0; i < 200; i++) h.advance(16);
  }
  assert.ok(h.calls.length > 10);
  assert.ok(h.calls.every(([, x, y]) => x > 0 && y > 0));
  assert.equal(h.frames.size, 0, "departure must stop the loop");
});

test("reduced motion and a hidden page do not keep scheduling frames", async () => {
  const h = await harness(true);
  h.player.play("arriving");
  assert.equal(h.frames.size, 0);
  h.media.matches = false; h.listeners.motion();
  assert.equal(h.frames.size, 1);
  h.document.hidden = true; h.listeners.visibilitychange();
  assert.equal(h.frames.size, 0);
  h.document.hidden = false; h.listeners.visibilitychange();
  assert.equal(h.frames.size, 1);
  h.listeners.pagehide();
  assert.equal(h.frames.size, 0);
});

test("frame inspection freezes an exact time and ordinary playback cancels inspection", async () => {
  const h = await harness();
  h.player.play("arriving"); h.advance(500);
  h.player.reviewPose("explain", 1800, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvas.dataset.action, "explain");
  assert.equal(h.canvas.dataset.elapsed, "1800");
  h.player.play("withdrawing"); h.advance(16);
  assert.equal(h.canvas.dataset.action, "withdrawing");
  assert.equal(h.canvas.dataset.elapsed, "16");
});
