const test = require("node:test");
const assert = require("node:assert/strict");
const { planSecondInstance } = require("../src/second-instance");
const { readConfig } = require("../src/config");

// Build the config a real second launch would forward, from an argv, so the plan is
// exercised through the same parser the app uses.
function planFromArgv(argv, currentState) {
  return planSecondInstance(readConfig(argv), currentState);
}

// Run planSecondInstance capturing the stderr it writes for rejected fields.
function planCapturing(incoming, currentState) {
  const lines = [];
  const restore = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try {
    const actions = planSecondInstance(incoming, currentState);
    return { actions, lines };
  } finally {
    process.stderr.write = restore;
  }
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

test("a forged command outside the whitelist is dropped with one stderr line", () => {
  const { actions, lines } = planCapturing({ command: "rm -rf /", provided: { command: true } });
  assert.ok(!actions.some((a) => a.type === "command"), "no command action");
  assert.ok(!actions.some((a) => a.type === "show"), "does not show on garbage");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /command/);
});

test("a malformed verse is dropped; a valid now still shows without it", () => {
  const { actions, lines } = planCapturing({ command: "now", verse: "; rm", provided: { command: true, verse: true } });
  assert.deepEqual(actions, [{ type: "show" }], "shows, but not the rejected verse");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /verse/);
});

test("out-of-range interval and duration are dropped", () => {
  const interval = planCapturing({ command: "live", intervalMinutes: 99999, provided: { command: true, interval: true } });
  assert.ok(!interval.actions.some((a) => a.type === "set-interval"));
  assert.match(interval.lines[0], /interval/);

  const duration = planCapturing({ command: "now", durationSeconds: 99999, provided: { command: true, duration: true } });
  assert.deepEqual(duration.actions, [{ type: "show" }], "no one-off duration applied");
  assert.match(duration.lines[0], /duration/);
});

test("non-boolean demo/screenshot are dropped", () => {
  const { actions, lines } = planCapturing({ command: "live", demo: "yes", screenshot: 1, provided: { command: true } });
  assert.ok(!actions.some((a) => a.type === "screenshot"), "no screenshot on a non-boolean");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /demo|screenshot/);
});

test("a clean config produces no rejection line", () => {
  const { lines } = planCapturing(readConfig(["--command=pause"]));
  assert.equal(lines.length, 0);
});

test("leading-zero verse is still accepted through the whitelist", () => {
  const { actions, lines } = planCapturing({ command: "now", verse: "02.47", provided: { command: true, verse: true } });
  assert.deepEqual(actions, [{ type: "show", verse: "02.47" }]);
  assert.equal(lines.length, 0);
});

test("missing or malformed config is handled without crashing", () => {
  assert.deepEqual(planSecondInstance(null), []);
  assert.deepEqual(planSecondInstance(undefined), []);
  assert.deepEqual(planSecondInstance("nope"), []);
  // An empty object with no fields: default command is now, so it shows.
  assert.deepEqual(planSecondInstance({}), [{ type: "show" }]);
});
