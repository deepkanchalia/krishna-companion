// A painted 2D skeletal character: image parts rotate around connected joints.
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
  function load(name) {
    if (atlases.has(name)) return atlases.get(name);
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
      img.src = `../assets/krishna-rig-${name}.png`;
    });
    atlases.set(name, promise);
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
      const loaded = await load(name);
      if (name !== style || disposed) return;
      sheet = loaded;
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
  function limb(x, y, angle, elbow, upper, lower, upperWidth, upperLength, lowerWidth, lowerLength, layer = "both") {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    // Overlapping round ends hide the seams at the shoulder, elbow and knee.
    if (layer !== "lower") part(upper, -upperWidth / 2, -7, upperWidth, upperLength + 14);
    ctx.translate(0, upperLength); ctx.rotate(elbow);
    if (layer !== "upper") part(lower, -lowerWidth / 2, -10, lowerWidth, lowerLength + 10);
    ctx.restore();
  }
  function draw(now) {
    const pose = motion.sample(action, now - started, reduced.matches);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.action = action;
    if (!sheet || !pose.visible) return;
    ctx.save();
    ctx.scale(canvas.width / 320, canvas.height / 460);
    ctx.imageSmoothingEnabled = style !== "pixel";
    ctx.translate(163 + pose.x, 24 + pose.y);
    ctx.scale(pose.facing, 1);
    ctx.fillStyle = "#dba53b25";
    ctx.beginPath(); ctx.ellipse(0, 392 - pose.y, 58, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(35, 119); ctx.rotate(pose.sash);
    part("sash", -38, 0, 76, 204); ctx.restore();
    limb(17, 213, pose.rightHip, pose.rightKnee, "thighRight", "shinRight", 51, 90, 40, 93);
    limb(-17, 213, pose.leftHip, pose.leftKnee, "thighLeft", "shinLeft", 51, 90, 38, 93);
    ctx.save(); ctx.translate(0, 204); ctx.rotate(pose.torso); ctx.translate(0, -204);
    const rightArm = [38, 116, pose.rightArm, pose.rightElbow, "upperRight", pose.hand === "blessing" ? "blessing" : "lowerRight", 34, 53, 30, 65];
    const leftArm = [-38, 116, pose.leftArm, pose.leftElbow, "upperLeft", pose.hand === "teaching" ? "teaching" : "lowerLeft", 34, 53, 30, 65];
    limb(...rightArm, "upper"); limb(...leftArm, "upper");
    // Shoulder shawl overlaps the upper-arm anchors, not exposed round sockets.
    part("torso", -67, 81, 134, 152);
    // Forearms belong in front of the drape; otherwise hands appear detached.
    limb(...rightArm, "lower"); limb(...leftArm, "lower");
    ctx.translate(0, 99); ctx.rotate(pose.head);
    part(pose.blink ? "closed" : "head", -45, -100, 90, 107);
    ctx.restore(); ctx.restore();
  }
  function tick(now) {
    frame = undefined;
    if (disposed || document.hidden || action === "absent") return;
    if (now - lastDraw >= (style === "pixel" ? 80 : 30)) { draw(now); lastDraw = now; }
    if (action === "withdrawing" && now - started >= motion.WITHDRAWAL_MS) { action = "absent"; draw(now); return; }
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }
  function play(next) {
    if (!motion.ACTIONS.includes(next)) return;
    cancelAnimationFrame(frame);
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
  window.krishnaCharacter = { play, choose };
  choose(style);
})();
