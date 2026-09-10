const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Sprite = require("../src/sprite-player");

const { FIGURE_STYLES, DEFAULT_FIGURE_STYLE } = require("../src/config");
const combined = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "anim", "manifest.json"), "utf8"));
const manifest = combined.styles[combined.default];

test("every figure style ships a complete, consistent manifest and its four sheets", () => {
  assert.equal(combined.default, DEFAULT_FIGURE_STYLE);
  assert.deepEqual(Object.keys(combined.styles).sort(), [...FIGURE_STYLES].sort());
  for (const [style, m] of Object.entries(combined.styles)) {
    assert.deepEqual(Sprite.validateManifest(m), [], `${style} manifest`);
    for (const name of ["walkin", "idle", "teach", "farewell"]) {
      const seg = m.segments[name];
      assert.ok(seg, `${style} ${name} segment`);
      assert.ok(seg.file.startsWith(`${style}/`), `${style} ${name} sheet path is inside its style folder`);
      assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "anim", seg.file)), `${style} ${name} sheet file`);
    }
    assert.equal(m.segments.idle.loop, true);
    assert.equal(m.segments.idle.pingpong, true);
    assert.equal(m.segments.walkin.loop, false);
    assert.equal(m.segments.farewell.loop, false);
  }
});

test("manifest.js is the manifest.json shipped as a script (CSP forbids fetch)", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", "anim", "manifest.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  // The sandbox gives objects a different prototype, so compare the serialised form.
  assert.equal(JSON.stringify(sandbox.window.KRISHNA_ANIM_STYLES), JSON.stringify(combined.styles));
  assert.equal(sandbox.window.KRISHNA_ANIM_DEFAULT_STYLE, combined.default);
  assert.equal(JSON.stringify(sandbox.window.KRISHNA_ANIM), JSON.stringify(manifest));
});

test("phases map to segments: walk in, stand, farewell; a continuing verse keeps standing", () => {
  assert.equal(Sprite.segmentForPhase("arriving"), "walkin");
  assert.equal(Sprite.segmentForPhase("arriving", { continuing: true }), "idle");
  assert.equal(Sprite.segmentForPhase("present"), "idle");
  assert.equal(Sprite.segmentForPhase("withdrawing"), "farewell");
  assert.equal(Sprite.segmentForPhase("absent"), null);
  assert.equal(Sprite.nextAfter("walkin"), "idle");
  assert.equal(Sprite.nextAfter(Sprite.EXPAND_GESTURE), "idle");
  assert.equal(Sprite.nextAfter("farewell"), null);
});

test("frame timing: once segments end, loops wrap, ping-pong reverses", () => {
  const once = { fps: 10, loop: false, frames: new Array(5) };
  assert.deepEqual(Sprite.frameAt(once, 0), { index: 0, done: false });
  assert.deepEqual(Sprite.frameAt(once, 450), { index: 4, done: false });
  assert.deepEqual(Sprite.frameAt(once, 500), { index: 4, done: true });
  const loop = { fps: 10, loop: true, frames: new Array(4) };
  assert.equal(Sprite.frameAt(loop, 500).index, 1);
  const pp = { fps: 10, loop: true, pingpong: true, frames: new Array(4) };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((k) => Sprite.frameAt(pp, k * 100).index), [0, 1, 2, 3, 2, 1, 0]);
  assert.equal(Sprite.durationMs(manifest.segments.walkin), Math.round(manifest.segments.walkin.frames.length / 12 * 1000));
});

for (const [style, styleManifest] of Object.entries(combined.styles)) test(`${style}: walk-in enters from the right and ends on the resting spot; farewell leaves to the right`, () => {
  const manifest = styleManifest;
  const cw = 220, ch = 286;
  const walk = manifest.segments.walkin.frames.length;
  const first = Sprite.placement(manifest, "walkin", 0, cw, ch);
  const last = Sprite.placement(manifest, "walkin", walk - 1, cw, ch);
  const rest = Sprite.placement(manifest, "idle", 0, cw, ch);
  assert.ok(first.x > rest.x + 60, "starts well to the right of the resting spot");
  assert.ok(first.x + first.w > cw, "starts partly beyond the right edge");
  assert.ok(Math.abs(last.x - rest.x) < 12, "ends within 12 px of the resting spot");
  const fw = manifest.segments.farewell.frames.length;
  const gone = Sprite.placement(manifest, "farewell", fw - 1, cw, ch);
  assert.ok(gone.x >= cw, "farewell ends fully beyond the right edge of the canvas");
  // feet stay near the canvas floor across every segment: a planted step may sit a few
  // px below the resting line, a lifted foot above it, never clipped by the canvas.
  for (const name of Object.keys(manifest.segments)) {
    const seg = manifest.segments[name];
    for (let i = 0; i < seg.frames.length; i += 1) {
      const p = Sprite.placement(manifest, name, i, cw, ch);
      assert.ok(p.y + p.h <= ch, `${name} frame ${i} feet inside the canvas`);
      assert.ok(p.y + p.h > ch - 45, `${name} frame ${i} feet near the floor`);
      assert.ok(p.y >= -1, `${name} frame ${i} head inside the canvas`);
    }
  }
});

test("a sheet that fails to load ends its segment instead of spinning, and a stale still never paints", () => {
  const drawn = [];
  const ctx = { clearRect() {}, drawImage: (...a) => drawn.push(a) };
  const canvas = { width: 440, height: 572, clientWidth: 220, clientHeight: 286, getContext: () => ctx };
  let clock = 0; const rafs = []; const listeners = {};
  const brokenImage = { complete: false, naturalWidth: 0, addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); } };
  const env = { canvas, loadImage: () => brokenImage, raf: (fn) => { rafs.push(fn); return rafs.length; }, caf: () => {}, now: () => clock };
  const player = Sprite.createSpritePlayer(manifest, env);
  const ended = [];
  player.play("farewell", (n) => ended.push(n));
  // decoding still pending: the clock holds and nothing is drawn
  for (let i = 0; i < 5 && rafs.length; i++) { clock += 16; rafs.shift()(); }
  assert.deepEqual(ended, []);
  assert.equal(drawn.length, 0);
  // the browser reports a load error: the segment ends on the next frame
  listeners.error.forEach((fn) => fn());
  clock += 16; rafs.shift()();
  assert.deepEqual(ended, ["farewell"]);
  assert.equal(player.isPlaying(), false);
  assert.equal(rafs.length, 0, "no frame requests remain");
  // a still requested before the sheet loads must not paint after clear()
  const pending = { complete: false, naturalWidth: 0, addEventListener: (type, fn) => { (listeners["still-" + type] = listeners["still-" + type] || []).push(fn); } };
  const player2 = Sprite.createSpritePlayer(manifest, { ...env, loadImage: () => pending });
  player2.still();
  player2.clear();
  pending.complete = true; pending.naturalWidth = 1760;
  (listeners["still-load"] || []).forEach((fn) => fn());
  assert.equal(drawn.length, 0, "cancelled still did not paint");
});

test("the player draws only while a segment plays and stops cleanly", () => {
  const drawn = [];
  const ctx = { clearRect() {}, drawImage: (...a) => drawn.push(a) };
  const canvas = { width: 440, height: 572, clientWidth: 220, clientHeight: 286, getContext: () => ctx };
  let clock = 0; const rafs = []; let cancelled = 0;
  const env = {
    canvas,
    loadImage: () => ({ complete: true, naturalWidth: 1 }),
    raf: (fn) => { rafs.push(fn); return rafs.length; },
    caf: () => { cancelled++; },
    now: () => clock
  };
  const player = Sprite.createSpritePlayer(manifest, env);
  const ended = [];
  assert.equal(player.play("walkin", (n) => ended.push(n)), true);
  assert.equal(player.isPlaying(), true);
  // drive the ticker past the walk-in
  const total = Sprite.durationMs(manifest.segments.walkin);
  while (rafs.length && clock <= total + 100) { const fn = rafs.shift(); clock += 16; fn(); }
  assert.deepEqual(ended, ["walkin"]);
  assert.equal(player.isPlaying(), false);
  assert.ok(drawn.length >= manifest.segments.walkin.frames.length - 1, "every frame was drawn once");
  assert.equal(rafs.length, 0, "no frame requests remain after the segment ends");
  player.play("idle");
  player.stop();
  assert.equal(cancelled, 1);
  assert.equal(player.isPlaying(), false);
  assert.equal(player.play("nope"), false);
});
