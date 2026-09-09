const test = require("node:test");
const assert = require("node:assert/strict");
const { sample, blend, ribbon, STYLES, ACTIONS, ARRIVAL_MS, WITHDRAWAL_MS, keyPixel } = require("../src/character-motion");

test("walking changes both hips and knees, and ends at a planted pose", () => {
  const a = sample("arriving", 200);
  const b = sample("arriving", 650);
  for (const joint of ["leftHip", "rightHip", "leftKnee", "rightKnee", "leftArm", "rightArm"]) {
    assert.notEqual(a[joint], b[joint], joint);
  }
  assert.ok(a.x > b.x);
  const settled = sample("arriving", ARRIVAL_MS);
  assert.equal(settled.x, 0);
  assert.equal(settled.leftHip, 0);
  assert.equal(settled.rightHip, 0);
});

test("verse and explanation bend elbows, then release large gestures for reading", () => {
  const teaching = sample("teach", 1300);
  const explaining = sample("explain", 1300);
  assert.ok(teaching.leftElbow > .3 && teaching.leftElbow < .45);
  assert.ok(explaining.rightElbow < -.2 && explaining.rightElbow > -.3);
  assert.equal(teaching.hand, undefined, "gestures must not swap forearm textures");
  assert.equal(sample("explain", 6000).leftElbow, .045);
});

test("farewell moves gently and exits without mirroring or flattening the figure", () => {
  assert.ok(sample("withdrawing", 1000).rightElbow < -.1);
  assert.ok(sample("withdrawing", 1800).x > 0);
  for (let t = 0; t <= WITHDRAWAL_MS; t += 8) assert.equal(sample("withdrawing", t).facing, 1);
  assert.equal(sample("withdrawing", WITHDRAWAL_MS).visible, false);
});

test("reduced motion is time-invariant; reading never swaps a whole head to blink", () => {
  for (const action of ACTIONS) assert.deepEqual(sample(action, 0, true), sample(action, 9900, true));
  assert.notEqual(sample("idle", 0).y, sample("idle", 600).y);
  assert.equal(sample("idle", 5000).blink, undefined);
  assert.equal(sample("idle", 5000).gaze, 0);
});

test("every sampled frame stays within restrained joint limits and changes continuously", () => {
  const limits = { leftArm: .25, rightArm: .25, leftElbow: .45, rightElbow: .35,
    leftHip: .13, rightHip: .13, leftKnee: .19, rightKnee: .19, head: .04, torso: .01 };
  for (const action of ACTIONS) {
    let previous = sample(action, 0);
    for (let t = 8; t <= 6000; t += 8) {
      const pose = sample(action, t);
      for (const [key, limit] of Object.entries(limits)) {
        assert.ok(Math.abs(pose[key]) <= limit, action + ": " + key);
        assert.ok(Math.abs(pose[key] - previous[key]) < .012, action + ": no joint snap in " + key);
      }
      assert.equal(pose.facing, 1);
      previous = pose;
    }
  }
});

test("action transitions begin at the displayed pose and ease into the next one", () => {
  for (const action of ACTIONS.filter((value) => value !== "absent")) {
    const from = sample(action, 1500);
    const target = sample("withdrawing", 0);
    assert.deepEqual(blend(from, target, 0), { ...from, visible: target.visible });
    assert.deepEqual(blend(from, target, 1), target);
    assert.ok(Math.abs(blend(from, target, .01).leftElbow - from.leftElbow) < .001);
  }
});

test("continuous limb curves have no gap, length change, tangent kink or fold-over", () => {
  for (const bend of [-.45, -.18, 0, .18, .45]) {
    const points = ribbon(192, 90, bend);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]; const b = points[i];
      assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 2) < 1e-10);
      assert.ok(Math.abs(b.angle - a.angle) < .05);
      assert.ok(b.y > a.y, "the limb must never fold back through itself");
    }
  }
});

test("all pose components stay finite, and the style/key allowlists are explicit", () => {
  for (const action of ACTIONS) for (let t = 0; t <= 10000; t += 25) {
    for (const value of Object.values(sample(action, t))) if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
  assert.deepEqual(STYLES, ["paint", "realistic", "pixel"]);
  assert.equal(keyPixel(255, 0, 255), 0);
  assert.equal(keyPixel(60, 130, 230), 255);
  assert.equal(keyPixel(230, 190, 70), 255);
});
