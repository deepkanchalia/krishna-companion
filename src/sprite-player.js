// Flipbook player for the darshan figure. Frames come from generated video of one
// Krishna painting (assets/anim/*.webp + manifest.js); nothing here invents motion.
// Pure planning lives in createSpritePlan so tests can run it without a canvas.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KrishnaSprite = api;
})(typeof window !== "undefined" ? window : null, function () {
  // Which segment each darshan phase shows. Absent and reduced motion show nothing
  // or a single still; the renderer decides which via `still`.
  function segmentForPhase(phase, { continuing = false } = {}) {
    if (phase === "arriving") return continuing ? "idle" : "walkin";
    if (phase === "present") return "idle";
    if (phase === "withdrawing") return "farewell";
    return null;
  }

  // The one-shot gesture played when the reader opens the purport.
  const EXPAND_GESTURE = "teach";
  // Resting frame for reduced motion / hidden tab: an eyes-open frame of the idle loop
  // (frame 0 falls inside a blink in the source clip).
  const STILL_FRAME = 6;
  // Longest a segment waits for its sheet to decode before giving up on it.
  const LOAD_TIMEOUT_MS = 8_000;

  // Sequence of segments to play after the current one ends.
  function nextAfter(segment) {
    if (segment === "walkin" || segment === "teach") return "idle";
    return null; // idle loops; farewell ends in absence
  }

  // Validate a manifest: every frame rect inside its sheet cell grid, fps > 0.
  function validateManifest(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== "object" || !manifest.segments) return ["no segments"];
    for (const [name, seg] of Object.entries(manifest.segments)) {
      if (!(seg.fps > 0)) errors.push(`${name}: fps`);
      if (!Array.isArray(seg.frames) || seg.frames.length === 0) { errors.push(`${name}: frames`); continue; }
      const [cw, ch] = seg.cell || [];
      for (const f of seg.frames) {
        if (!(f.w > 0 && f.h > 0 && f.w <= cw && f.h <= ch)) errors.push(`${name}: frame size`);
        if (f.sx < 0 || f.sy < 0) errors.push(`${name}: frame origin`);
      }
    }
    return errors;
  }

  // Frame index for a segment at elapsed ms: once, loop, or ping-pong.
  function frameAt(seg, elapsedMs) {
    const n = seg.frames.length;
    const k = Math.floor(elapsedMs / 1000 * seg.fps);
    if (!seg.loop) return { index: Math.min(k, n - 1), done: k >= n };
    if (seg.pingpong && n > 1) {
      const period = 2 * (n - 1);
      const m = k % period;
      return { index: m < n ? m : period - m, done: false };
    }
    return { index: k % n, done: false };
  }

  function durationMs(seg) {
    return Math.round(seg.frames.length / seg.fps * 1000);
  }

  // Where to draw a frame on a canvas of (cw x ch) css px, keeping the figure's true
  // scene motion: offsets are relative to the resting (idle) frame so feet stay on one
  // line and the walk covers real distance.
  // `pad` keeps a floor margin so frames whose feet sit a few px below the resting
  // line (a planted step) are not clipped.
  function placement(manifest, segName, index, cw, ch, pad = 14) {
    const seg = manifest.segments[segName];
    const rest = manifest.segments.idle.frames[0];
    const all = Object.values(manifest.segments).flatMap((s) => s.frames);
    // Map the scene's full vertical extent (highest head to lowest foot across every
    // frame of every segment) onto the box once, so each frame keeps its true scene
    // position and none can leave the box.
    const sceneTop = Math.min(...all.map((g) => g.oy));
    const sceneBottom = Math.max(...all.map((g) => g.oy + g.h));
    const s = (ch - pad) / (sceneBottom - sceneTop);
    const f = seg.frames[index];
    const dx = (f.ox - rest.ox) * s;
    const w = f.w * s, h = f.h * s;
    const x = cw / 2 - (rest.w * s) / 2 + dx;
    const y = (f.oy - sceneTop) * s;
    return { x, y, w, h, scale: s };
  }

  // Runtime player. `env` supplies the browser pieces so tests can stub them.
  function createSpritePlayer(manifest, env) {
    const { canvas, loadImage, raf, caf, now } = env;
    const images = {};
    let active = null; // { name, startedAt, onEnd }
    let frameHandle = null;
    let lastIndex = -1;
    let stillToken = 0; // a later still() or clear() cancels a pending still paint

    function image(name) {
      if (!images[name]) {
        const img = loadImage(manifest.segments[name].file);
        if (img && typeof img.addEventListener === "function") {
          img.addEventListener("load", () => { img.__ready = true; });
          img.addEventListener("error", () => { img.__failed = true; });
        }
        images[name] = img;
      }
      return images[name];
    }

    function failed(img) {
      return img.__failed === true || (img.complete === true && !img.naturalWidth && img.__ready !== true);
    }

    // Decode every sheet up front so the first darshan does not stall mid-walk.
    function preload() {
      for (const name of Object.keys(manifest.segments)) image(name);
    }

    // Keep the backing store matched to the element's current CSS size (it changes with
    // the compact media query) so the figure is never squashed or clipped.
    function fitBacking() {
      const ratio = env.pixelRatio ? env.pixelRatio() : 1;
      const laidOut = canvas.clientWidth > 0 && canvas.clientHeight > 0;
      if (laidOut) {
        const bw = Math.round(canvas.clientWidth * ratio), bh = Math.round(canvas.clientHeight * ratio);
        if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      }
      // Without layout (display:none) the backing store is left as it is; never derive
      // a new size from it, which would compound the ratio on every draw.
      const cw = laidOut ? canvas.clientWidth : canvas.width / ratio;
      const ch = laidOut ? canvas.clientHeight : canvas.height / ratio;
      return { cw, ch, sx: canvas.width / cw, sy: canvas.height / ch };
    }

    function draw(name, index) {
      const seg = manifest.segments[name];
      const f = seg.frames[index];
      const ctx = canvas.getContext("2d");
      const { cw, ch, sx, sy } = fitBacking();
      const p = placement(manifest, name, index, cw, ch);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = image(name);
      if (!loaded(img)) return;
      // Independent x/y scales: rounding the backing store can make them differ slightly.
      ctx.drawImage(img, f.sx, f.sy, f.w, f.h, p.x * sx, p.y * sy, p.w * sx, p.h * sy);
    }

    function loaded(img) {
      return Boolean(img.complete && img.naturalWidth) || img.__ready === true;
    }

    function tick() {
      frameHandle = null;
      if (!active) return;
      const seg = manifest.segments[active.name];
      // A segment removed from the manifest mid-play, or a sheet that failed to load,
      // ends at once so the darshan continues and the completion callback still fires.
      const img = seg ? image(active.name) : null;
      if (!seg || failed(img)) {
        const finished = active; active = null;
        if (finished.onEnd) finished.onEnd(finished.name);
        return;
      }
      // A sheet still decoding must not eat frames: hold the clock until it is ready,
      // but never for longer than LOAD_TIMEOUT_MS; after that the segment ends as failed.
      if (!loaded(img)) {
        if (active.holdSince === undefined) active.holdSince = now();
        if (now() - active.holdSince > LOAD_TIMEOUT_MS) {
          img.__failed = true;
          const finished = active; active = null;
          if (finished.onEnd) finished.onEnd(finished.name);
          return;
        }
        active.startedAt = now();
        frameHandle = raf(tick);
        return;
      }
      const { index, done } = frameAt(seg, now() - active.startedAt);
      if (done) {
        const finished = active; active = null;
        if (finished.onEnd) finished.onEnd(finished.name);
        return;
      }
      if (index !== lastIndex) { draw(active.name, index); lastIndex = index; }
      frameHandle = raf(tick);
    }

    return {
      play(name, onEnd) {
        if (!manifest.segments[name]) return false;
        active = { name, startedAt: now(), onEnd };
        lastIndex = -1;
        stillToken++; // a still that is still decoding must not paint over this segment
        image(name);
        if (frameHandle === null) frameHandle = raf(tick);
        return true;
      },
      still(name = "idle", index = STILL_FRAME) {
        this.stop();
        const img = image(name);
        const token = ++stillToken;
        const paint = () => { if (token === stillToken) draw(name, index); };
        if (loaded(img)) paint(); else if (typeof img.addEventListener === "function") img.addEventListener("load", paint, { once: true });
      },
      preload,
      stop() {
        active = null;
        if (frameHandle !== null) { caf(frameHandle); frameHandle = null; }
      },
      clear() {
        this.stop();
        stillToken++;
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      },
      isPlaying() { return active !== null; },
      current() { return active ? active.name : null; }
    };
  }

  return { segmentForPhase, nextAfter, EXPAND_GESTURE, STILL_FRAME, validateManifest, frameAt, durationMs, placement, createSpritePlayer };
});
