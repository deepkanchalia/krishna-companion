// Deterministic choreography and continuous limb curves; no Electron or DOM.
(function (root, factory) {
  const motion = factory();
  if (typeof module === "object" && module.exports) module.exports = motion;
  else root.KrishnaMotion = motion;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ARRIVAL_MS = 3200;
  const WITHDRAWAL_MS = 3200;
  const STYLES = ["paint", "realistic", "pixel"];
  const ACTIONS = ["arriving", "teach", "explain", "listen", "idle", "withdrawing", "absent"];
  // Pose names are screen-relative. With the backs of relaxed hands visible,
  // thumbs point inward: Krishna's anatomical right hand is on screen-left.
  const ARM_BINDINGS = Object.freeze({
    leftArm: Object.freeze({ upper: "upperLeft", lower: "lowerRight", anatomical: "right", x: -38 }),
    rightArm: Object.freeze({ upper: "upperRight", lower: "lowerLeft", anatomical: "left", x: 38 })
  });
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { const x = clamp(v); return x * x * x * (10 + x * (-15 + 6 * x)); };
  const envelope = (t, duration) => smooth(t / 1000) * (1 - smooth((t - duration + 1300) / 1300));

  function expression(action, elapsed, reduced = false) {
    if (reduced) return { smile: .65, blink: 0 };
    const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
    // Asymmetric close/reopen, separated by long open-eye intervals. No lip sync
    // is invented for the text-only verse display.
    const phase = t % 5300;
    const blink = smooth((phase - 2300) / 110) * (1 - smooth((phase - 2440) / 190));
    const greeting = action === "arriving" ? smooth((t - 1600) / 1200) : 1;
    const warmth = ["teach", "explain", "listen"].includes(action) ? .8 : .65;
    const smile = greeting * (warmth + .15 * Math.sin(t / 2700) ** 2);
    return { smile, blink };
  }

  function sample(action, elapsed, reduced = false) {
    const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
    const p = { x: 0, y: 0, torso: 0, head: 0, gaze: 0,
      leftArm: .045, rightArm: -.045, leftElbow: .045, rightElbow: -.045,
      leftHip: 0, rightHip: 0, leftKnee: 0, rightKnee: 0,
      sash: 0, visible: action !== "absent", facing: 1, ...expression(action, t, reduced) };
    if (reduced) { p.visible = !["absent", "withdrawing"].includes(action); return p; }
    p.y = Math.sin(t / 1500) * .28;
    p.head = Math.sin(t / 2100) * .006;
    p.sash = Math.sin(t / 1800) * .009;
    let walking = 0;
    let walkTime = t;
    if (action === "arriving") {
      p.x = 205 * (1 - smooth(t / 2800));
      walking = smooth(t / 450) * (1 - smooth((t - 2200) / 600));
      p.head += .022 * Math.sin(Math.PI * clamp((t - 2700) / 500));
    } else if (action === "withdrawing") {
      // Keep the front-facing silhouette. A 2D scale-through-zero is not a turn.
      const farewell = envelope(t, 1800);
      p.rightArm -= .13 * farewell;
      p.rightElbow -= .24 * farewell;
      p.head += .018 * farewell;
      walkTime = Math.max(0, t - 1200);
      walking = smooth(walkTime / 600);
      p.x = 240 * smooth(walkTime / 2000);
      p.visible = t < WITHDRAWAL_MS;
    }
    if (walking > 0) {
      const cycle = walkTime / 1400 * Math.PI * 2;
      const stride = Math.sin(cycle) * walking;
      // Short, cloth-covered steps; no high knees, pendulum hands or body rocking.
      p.leftHip = stride * .045;
      p.rightHip = -stride * .045;
      p.leftKnee = -.08 * Math.pow((1 + Math.cos(cycle)) / 2, 2) * walking;
      p.rightKnee = .08 * Math.pow((1 - Math.cos(cycle)) / 2, 2) * walking;
      p.leftArm += stride * .045;
      p.rightArm -= stride * .045;
      p.leftElbow += .035 * walking;
      p.rightElbow -= .035 * walking;
      p.y -= .55 * Math.sin(cycle) ** 2 * walking;
      p.sash += Math.sin(cycle - .6) * .022 * walking;
    } else if (["teach", "explain"].includes(action)) {
      const gesture = envelope(t, action === "teach" ? 4300 : 5700);
      p.leftArm += gesture * .18;
      p.leftElbow += gesture * .38;
      p.head += gesture * .018;
      // Reader-facing until identity-consistent side-turn frames are approved.
      if (action === "explain") {
        p.rightArm -= gesture * .10;
        p.rightElbow -= gesture * .22;
      }
    } else if (action === "listen") {
      p.head += .027 * smooth(t / 1000);
    }
    return p;
  }

  function blend(from, to, progress) {
    if (progress >= 1) return { ...to };
    if (progress <= 0) return { ...from, visible: to.visible };
    const mix = smooth(progress);
    const result = { ...to };
    for (const key of Object.keys(to)) {
      if (typeof to[key] === "number") result[key] = from[key] + (to[key] - from[key]) * mix;
    }
    return result;
  }

  // One continuous centerline, not two rotated cutouts. Tangents ease through
  // a 36px bend region; every cross-section retains its original width.
  function ribbon(length, joint, bend, step = 2) {
    let x = 0;
    let y = 0;
    const points = [];
    for (let s = 0; s <= length; s += step) {
      const angle = bend * smooth((s - joint + 18) / 36);
      points.push({ s, x, y, angle });
      const middle = bend * smooth((s + step / 2 - joint + 18) / 36);
      x -= Math.sin(middle) * step;
      y += Math.cos(middle) * step;
    }
    return points;
  }

  function keyPixel(r, g, b) {
    return r > 130 && b > 130 && Math.min(r, b) - g > 70 ? 0 : 255;
  }
  return { ARRIVAL_MS, WITHDRAWAL_MS, STYLES, ACTIONS, ARM_BINDINGS, sample, expression, blend, ribbon, keyPixel };
});
