const test = require("node:test");
const assert = require("node:assert/strict");
const { sample, STYLES, ACTIONS, ARRIVAL_MS, WITHDRAWAL_MS, keyPixel } = require("../src/character-motion");

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
  assert.ok(teaching.leftElbow > 1);
  assert.ok(explaining.rightElbow < -.5);
  assert.equal(teaching.hand, "teaching");
  assert.equal(sample("teach", 5000).hand, "rest");
  assert.equal(sample("explain", 6000).leftElbow, .06);
});

test("farewell raises a palm, turns, walks and becomes invisible at the shared deadline", () => {
  assert.equal(sample("withdrawing", 650).hand, "blessing");
  assert.ok(sample("withdrawing", 1800).x > 0);
  assert.equal(sample("withdrawing", 1800).facing, -1);
  assert.equal(sample("withdrawing", WITHDRAWAL_MS).visible, false);
});

test("reduced motion is time-invariant, while normal reading breathes and blinks", () => {
  for (const action of ACTIONS) assert.deepEqual(sample(action, 0, true), sample(action, 9900, true));
  assert.notEqual(sample("idle", 0).y, sample("idle", 600).y);
  assert.equal(sample("idle", 5000).blink, true);
  assert.equal(sample("idle", 5200).blink, false);
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
