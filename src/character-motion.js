// Shared, deterministic choreography. No DOM, Electron, permissions or randomness.
(function (root, factory) {
  const motion = factory();
  if (typeof module === "object" && module.exports) module.exports = motion;
  else root.KrishnaMotion = motion;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ARRIVAL_MS = 3200;
  const WITHDRAWAL_MS = 3200;
  const STYLES = ["paint", "realistic", "pixel"];
  const ACTIONS = ["arriving", "teach", "explain", "listen", "idle", "withdrawing", "absent"];
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
  const envelope = (t, duration) => smooth(t / 550) * (1 - smooth((t - duration + 800) / 800));

  function leg(hipX, hipY, footX, footY) {
    const dx = footX - hipX;
    const dy = footY - hipY;
    const length = Math.min(179.5, Math.hypot(dx, dy));
    const bend = Math.acos(length / 180);
    const aim = Math.atan2(-dx, dy);
    return { hip: aim + bend, knee: -2 * bend };
  }

  function sample(action, elapsed, reduced = false) {
    const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
    const p = { x: 0, y: 0, torso: 0, head: 0, leftArm: .07, rightArm: -.07,
      leftElbow: .06, rightElbow: -.06, leftHip: 0, rightHip: 0,
      leftKnee: 0, rightKnee: 0, sash: 0, blink: false, visible: action !== "absent", hand: "rest", facing: 1 };
    if (reduced) { p.visible = !["absent", "withdrawing"].includes(action); return p; }
    p.y = Math.sin(t / 950) * .65;
    p.head = Math.sin(t / 1700) * .012;
    p.torso = Math.sin(t / 1900) * .007;
    p.sash = Math.sin(t / 1100) * .018;
    p.blink = t % 5300 > 4900 && t % 5300 < 5040;
    let walking = false;
    let walkTime = t;
    let strength = 1;
    if (action === "arriving") {
      const progress = clamp(t / 2800);
      p.x = 205 * (1 - progress);
      strength = 1 - smooth((t - 2350) / 450);
      walking = t < 2800;
      p.head += .08 * Math.sin(Math.PI * clamp((t - 2700) / 500));
    }
    if (action === "withdrawing") {
      const farewell = envelope(t, 1400);
      p.rightArm = -.38 * farewell;
      p.rightElbow = -1.65 * farewell;
      p.hand = farewell > .15 ? "blessing" : "rest";
      walking = t > 1200;
      walkTime = t - 1200;
      strength = smooth(walkTime / 350);
      p.x = 240 * clamp(walkTime / 2000);
      p.facing = 1 - 2 * smooth((t - 900) / 350);
      p.visible = t < WITHDRAWAL_MS;
    }
    if (walking) {
      const cycle = walkTime / 900 * Math.PI * 2;
      p.y = -2 * Math.abs(Math.sin(cycle)) * strength;
      for (const [side, offset, hipX] of [["left", 0, -17], ["right", Math.PI, 17]]) {
        const angle = cycle + offset;
        const footX = hipX + Math.cos(angle) * 29 * strength;
        const footY = 388 - Math.max(0, Math.sin(angle)) * 26 * strength;
        const joint = leg(hipX, 213 + p.y, footX, footY);
        p[side + "Hip"] = joint.hip * strength;
        p[side + "Knee"] = joint.knee * strength;
      }
      p.leftArm = Math.sin(cycle) * .28 * strength;
      p.rightArm = -Math.sin(cycle) * .28 * strength;
      p.leftElbow = .18 + Math.max(0, -Math.sin(cycle)) * .18 * strength;
      p.rightElbow = -.18 - Math.max(0, Math.sin(cycle)) * .18 * strength;
      p.sash = Math.sin(cycle - .8) * .12 * strength;
      p.torso = Math.sin(cycle) * .015 * strength;
    } else if (["teach", "explain"].includes(action)) {
      const gesture = envelope(t, action === "teach" ? 4300 : 5700);
      const beat = Math.sin(t / 390) * .07;
      p.leftArm += gesture * (.35 + beat);
      p.leftElbow += gesture * (1.15 + beat);
      p.head += gesture * (.055 + .035 * Math.sin(t / 520));
      p.torso += gesture * .025;
      p.hand = gesture > .2 ? "teaching" : "rest";
      if (action === "explain") {
        p.rightArm -= gesture * .22;
        p.rightElbow -= gesture * .7;
      }
    } else if (action === "listen") {
      const attentive = smooth(t / 700);
      p.head += .09 * attentive;
      p.torso += .025 * attentive;
    }
    return p;
  }

  // The source atlas has a deliberate solid key color, never a fake alpha grid.
  function keyPixel(r, g, b) {
    const key = Math.min(r, b) - g;
    if (r > 130 && b > 130 && key > 70) return 0;
    return 255;
  }
  return { ARRIVAL_MS, WITHDRAWAL_MS, STYLES, ACTIONS, sample, leg, keyPixel };
});
