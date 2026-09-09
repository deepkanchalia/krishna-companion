// Continuous painted limbs. No joint cutout swaps, mirroring or scale-through-zero.
(function () {
  const canvas = document.querySelector("#krishna-character");
  const ctx = canvas.getContext("2d");
  const motion = window.KrishnaMotion;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const select = document.querySelector("#character-style");
  const status = document.querySelector("#character-status");
  const atlases = new Map();
  let style = "paint";
  let action = "absent";
  let started = performance.now();
  let frame;
  let lastDraw = -Infinity;
  let disposed = false;
  let transitionFrom;
  let currentPose = motion.sample("absent", 0);
  let review;
  let textures;
  let heads;
  try {
    const saved = localStorage.getItem("krishna-character-style");
    if (motion.STYLES.includes(saved)) style = saved;
  } catch (_) { /* A blocked preference store must not block darshan. */ }
  select.value = style;

  // Source coordinates are in the 1254-square atlas; all styles share this rig.
  const parts = {
    head: [24, 3, 267, 309], closed: [24, 928, 267, 306],
    torso: [340, 8, 308, 303],
    upperLeft: [729, 15, 123, 290], lowerLeft: [1047, 8, 109, 305],
    upperRight: [91, 320, 123, 293], lowerRight: [422, 318, 103, 305],
    thighLeft: [708, 320, 165, 300], shinLeft: [1047, 321, 111, 297],
    thighRight: [62, 632, 184, 295], shinRight: [400, 630, 136, 298],
    sash: [662, 630, 255, 297], teaching: [1050, 630, 103, 279],
    blessing: [410, 932, 112, 265]
  };
  function load(name, kind = "rig") {
    const cacheKey = `${kind}-${name}`;
    if (atlases.has(cacheKey)) return atlases.get(cacheKey);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const sheet = document.createElement("canvas");
          sheet.width = sheet.height = 1254;
          const context = sheet.getContext("2d", { willReadFrequently: true });
          context.drawImage(img, 0, 0, 1254, 1254);
          const pixels = context.getImageData(0, 0, 1254, 1254);
          for (let i = 0; i < pixels.data.length; i += 4) {
            pixels.data[i + 3] = motion.keyPixel(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
          }
          context.putImageData(pixels, 0, 0);
          resolve(sheet);
        } catch (error) { reject(error); }
      };
      img.onerror = () => reject(new Error("Character artwork could not load"));
      img.src = `../assets/krishna-${kind}-${name}.png`;
    });
    atlases.set(cacheKey, promise);
    return promise;
  }
  let sheet;
  async function choose(name) {
    if (!motion.STYLES.includes(name)) return;
    style = name;
    select.value = name;
    document.body.dataset.characterStyle = name;
    status.textContent = "Loading artwork…";
    try {
      const [loaded, headSheet] = await Promise.all([load(name), load(name, "heads")]);
      if (name !== style || disposed) return;
      sheet = loaded;
      heads = headSheet;
      textures = {
        leftArm: stitch("upperLeft", "lowerLeft", 34, 53, 30, 65),
        rightArm: stitch("upperRight", "lowerRight", 34, 53, 30, 65),
        leftLeg: stitch("thighLeft", "shinLeft", 51, 90, 38, 93),
        rightLeg: stitch("thighRight", "shinRight", 51, 90, 40, 93)
      };
      status.textContent = "";
      try { localStorage.setItem("krishna-character-style", name); } catch (_) {}
      draw(performance.now());
    } catch (_) {
      if (name === style) status.textContent = "Artwork unavailable · try another style";
    }
  }
  function part(name, x, y, w, h) {
    ctx.drawImage(sheet, ...parts[name], x, y, w, h);
  }
  function stitch(upper, lower, upperWidth, joint, lowerWidth, lowerLength) {
    const texture = document.createElement("canvas");
    const length = joint + lowerLength + 8;
    texture.width = 64 * 3; texture.height = length * 3;
    const paint = texture.getContext("2d");
    paint.scale(3, 3);
    paint.drawImage(sheet, ...parts[upper], 32 - upperWidth / 2, 0, upperWidth, joint + 14);
    // Feather the fixed rest-pose overlap once. The assembled texture subsequently
    // bends as one surface, so no end cap can rotate out of a socket.
    const lowerLayer = document.createElement("canvas");
    lowerLayer.width = texture.width; lowerLayer.height = texture.height;
    const lowerPaint = lowerLayer.getContext("2d"); lowerPaint.scale(3, 3);
    lowerPaint.drawImage(sheet, ...parts[lower], 32 - lowerWidth / 2, joint - 5, lowerWidth, lowerLength + 13);
    lowerPaint.globalCompositeOperation = "destination-in";
    const fade = lowerPaint.createLinearGradient(0, joint - 5, 0, joint + 7);
    fade.addColorStop(0, "#0000"); fade.addColorStop(1, "#000");
    lowerPaint.fillStyle = fade; lowerPaint.fillRect(0, 0, 64, length);
    paint.drawImage(lowerLayer, 0, 0, 64, length);
    return { image: texture, length, joint: joint + 7 };
  }
  function limb(name, x, y, angle, bend, layer = "both") {
    const texture = textures[name];
    const points = motion.ribbon(texture.length, texture.joint, bend);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.translate(0, -7);
    for (const point of points) {
      if (layer === "upper" && point.s >= texture.joint) continue;
      if (layer === "lower" && point.s < texture.joint) continue;
      const height = Math.min(3.5, texture.length - point.s);
      if (height <= 0) continue;
      ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(point.angle);
      ctx.drawImage(texture.image, 0, point.s * 3, 192, height * 3, -32, 0, 64, height);
      ctx.restore();
    }
    ctx.restore();
  }
  function draw(now) {
    const elapsed = review ? review.elapsed + (review.running ? (now - review.started) * review.speed : 0) : now - started;
    const activeAction = review ? review.action : action;
    const target = motion.sample(activeAction, elapsed, reduced.matches);
    const pose = !review && transitionFrom && !reduced.matches ? motion.blend(transitionFrom, target, elapsed / 800) : target;
    if (review) pose.x = 0; // In-place inspection keeps every joint on screen.
    currentPose = pose;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.action = activeAction;
    canvas.dataset.elapsed = String(Math.round(elapsed));
    if (!sheet || !pose.visible) return;
    ctx.save();
    ctx.scale(canvas.width / 320, canvas.height / 460);
    ctx.imageSmoothingEnabled = style !== "pixel";
    ctx.translate(163 + pose.x, 24 + pose.y);
    ctx.fillStyle = "#dba53b25";
    ctx.beginPath(); ctx.ellipse(0, 392 - pose.y, 58, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(35, 119); ctx.rotate(pose.sash);
    part("sash", -38, 0, 76, 204); ctx.restore();
    limb("rightLeg", 17, 213, pose.rightHip, pose.rightKnee);
    limb("leftLeg", -17, 213, pose.leftHip, pose.leftKnee);
    ctx.save(); ctx.translate(0, 204); ctx.rotate(pose.torso); ctx.translate(0, -204);
    const rightArm = ["rightArm", 38, 116, pose.rightArm, pose.rightElbow];
    const leftArm = ["leftArm", -38, 116, pose.leftArm, pose.leftElbow];
    limb(...rightArm, "upper"); limb(...leftArm, "upper");
    // Shoulder shawl overlaps the upper-arm anchors, not exposed round sockets.
    part("torso", -67, 81, 134, 152);
    // Forearms belong in front of the drape; otherwise hands appear detached.
    limb(...rightArm, "lower"); limb(...leftArm, "lower");
    ctx.translate(0, 99); ctx.rotate(pose.head);
    // Front-facing reader contact is the default. No whole-head blink swaps.
    const headIndex = 4; // Side-view candidates failed crown/identity continuity review.
    ctx.drawImage(heads, (headIndex % 3) * 418, Math.floor(headIndex / 3) * 418, 418, 418, -54, -108, 108, 116);
    ctx.restore(); ctx.restore();
  }
  function tick(now) {
    frame = undefined;
    if (disposed || document.hidden || (!review && action === "absent")) return;
    if (review && !review.running) return;
    if (now - lastDraw >= 15) { draw(now); lastDraw = now; }
    if (!review && action === "withdrawing" && now - started >= motion.WITHDRAWAL_MS) { action = "absent"; draw(now); return; }
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }
  function play(next) {
    if (!motion.ACTIONS.includes(next)) return;
    cancelAnimationFrame(frame);
    transitionFrom = currentPose.visible && next !== "arriving" ? { ...currentPose } : undefined;
    review = undefined;
    action = next; started = performance.now(); lastDraw = -Infinity;
    draw(started);
    if (!reduced.matches && next !== "absent" && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function resume() { cancelAnimationFrame(frame); draw(performance.now()); if (!document.hidden && !reduced.matches && action !== "absent") frame = requestAnimationFrame(tick); }
  select.addEventListener("change", () => choose(select.value));
  select.addEventListener("pointerdown", () => window.krishna?.engage());
  reduced.addEventListener("change", resume);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("pagehide", () => { disposed = true; cancelAnimationFrame(frame); });
  function reviewPose(next, elapsed = 0, speed = 0) {
    if (!motion.ACTIONS.includes(next) || !Number.isFinite(elapsed) || ![0, .25, 1].includes(speed)) return;
    cancelAnimationFrame(frame);
    review = { action: next, elapsed: Math.max(0, Math.min(6000, elapsed)), speed, running: speed > 0, started: performance.now() };
    draw(performance.now());
    if (review.running && !reduced.matches) frame = requestAnimationFrame(tick);
  }
  window.krishnaCharacter = { play, choose, reviewPose };
  choose(style);
})();
