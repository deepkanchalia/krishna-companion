const test = require("node:test");
const assert = require("node:assert/strict");
const { planSecondInstance } = require("../src/second-instance");
const { readConfig } = require("../src/config");

// Build the config a real second launch would forward, from an argv, so the plan is
// exercised through the same parser the app uses.
function planFromArgv(argv, currentState) {
  return planSecondInstance(readConfig(argv), currentState);
}

test("now shows a darshan", () => {
  assert.deepEqual(planFromArgv(["--command=now"]), [{ type: "show" }]);
});

test("now with a verse shows that verse", () => {
  assert.deepEqual(planFromArgv(["--command=now", "--verse=2.47"]), [{ type: "show", verse: "2.47" }]);
});

test("a bare --verse also means show me this verse", () => {
  assert.deepEqual(planFromArgv(["--verse=1.16"]), [{ type: "show", verse: "1.16" }]);
});

test("--interval alone changes cadence without forwarding the defaulted command", () => {
  // The launch carries the default command "live"; forwarding it would resume a paused
  // companion, so a --interval-only launch must produce set-interval and nothing else.
  assert.deepEqual(planFromArgv(["--interval=90"], { intervalMinutes: 30 }), [
    { type: "set-interval", minutes: 90 }
  ]);
});

test("--duration applies to this showing only", () => {
  assert.deepEqual(planFromArgv(["--command=now", "--duration=15"]), [
    { type: "show", durationSeconds: 15 }
  ]);
});

test("a plain now does not reset a running instance's cadence", () => {
  // config carries the default interval (30), but it was not provided, so no set-interval.
  const actions = planFromArgv(["--command=now"], { intervalMinutes: 60 });
  assert.ok(!actions.some((action) => action.type === "set-interval"));
});

test("demo behaves like a direct launch: shows now", () => {
  assert.deepEqual(planFromArgv(["--demo"]), [{ type: "show" }]);
});

test("demo with a verse and screenshot shows the verse and captures", () => {
  assert.deepEqual(planFromArgv(["--demo", "--verse=1.32-35", "--screenshot"]), [
    { type: "show", verse: "1.32-35" },
    { type: "screenshot" }
  ]);
});

test("pause and other commands are forwarded", () => {
  assert.deepEqual(planFromArgv(["--command=pause"]), [{ type: "command", name: "pause" }]);
  assert.deepEqual(planFromArgv(["--command=stop"]), [{ type: "command", name: "stop" }]);
});

test("missing or malformed config is handled without crashing", () => {
  assert.deepEqual(planSecondInstance(null), []);
  assert.deepEqual(planSecondInstance(undefined), []);
  assert.deepEqual(planSecondInstance("nope"), []);
  // An empty object with no fields: default command is now, so it shows.
  assert.deepEqual(planSecondInstance({}), [{ type: "show" }]);
});
