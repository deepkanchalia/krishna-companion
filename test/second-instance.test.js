const test = require("node:test");
const assert = require("node:assert/strict");
const { planSecondInstance } = require("../src/second-instance");
const config = require("../src/config");
const { readConfig, SECOND_INSTANCE_COMMANDS } = config;

// planSecondInstance is pure and returns { actions, rejected }; these helpers pull out
// the piece each test cares about. Build the config a real second launch would forward
// from an argv, so the plan is exercised through the same parser the app uses.
function planFromArgv(argv, currentState) {
  return planSecondInstance(readConfig(argv), currentState).actions;
}

// The names of the fields the validator rejected, for the rejection assertions.
function rejectedFields(incoming, currentState) {
  return planSecondInstance(incoming, currentState).rejected.map((entry) => entry.field);
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

test("start, voice-on and voice-off are accepted (were wrongly rejected before)", () => {
  assert.deepEqual(planFromArgv(["--command=start"]), [{ type: "command", name: "start" }]);
  assert.deepEqual(planFromArgv(["--command=voice-on"]), [{ type: "command", name: "voice-on" }]);
  assert.deepEqual(planFromArgv(["--command=voice-off"]), [{ type: "command", name: "voice-off" }]);
});

test("every command the CLI dispatches to Electron is on the accepted list", () => {
  // Exactly the commands bin/krshna.js starts Electron for (launch()), plus the now case.
  for (const command of ["now", "live", "start", "pause", "resume", "stop", "voice-on", "voice-off"]) {
    assert.ok(SECOND_INSTANCE_COMMANDS.includes(command), `${command} must be accepted`);
  }
});

test("the validator's bounds equal the limits readConfig enforces", () => {
  assert.equal(readConfig(["--interval=99999"]).intervalMinutes, config.INTERVAL_MINUTES_MAX);
  assert.equal(readConfig(["--interval=0"]).intervalMinutes, config.INTERVAL_MINUTES_MIN);
  assert.equal(readConfig(["--duration=99999"]).durationSeconds, config.DURATION_SECONDS_MAX);
  assert.equal(readConfig(["--duration=-5"]).durationSeconds, config.DURATION_SECONDS_MIN);
});

test("planSecondInstance is pure: it reports rejected fields instead of writing stderr", () => {
  const result = planSecondInstance({ command: "rm -rf /", provided: { command: true } });
  assert.deepEqual(Object.keys(result).sort(), ["actions", "rejected"]);
  assert.ok(Array.isArray(result.rejected) && typeof result.rejected[0].reason === "string");
});

test("a forged command outside the whitelist is rejected and does not act", () => {
  const result = planSecondInstance({ command: "rm -rf /", provided: { command: true } });
  assert.ok(!result.actions.some((a) => a.type === "command"), "no command action");
  assert.ok(!result.actions.some((a) => a.type === "show"), "does not show on garbage");
  assert.deepEqual(result.rejected.map((r) => r.field), ["command"]);
});

test("a malformed verse is dropped; a valid now still shows without it", () => {
  const result = planSecondInstance({ command: "now", verse: "; rm", provided: { command: true, verse: true } });
  assert.deepEqual(result.actions, [{ type: "show" }], "shows, but not the rejected verse");
  assert.deepEqual(result.rejected.map((r) => r.field), ["verse"]);
});

test("out-of-range interval and duration are dropped", () => {
  const interval = planSecondInstance({ command: "live", intervalMinutes: 99999, provided: { command: true, interval: true } });
  assert.ok(!interval.actions.some((a) => a.type === "set-interval"));
  assert.deepEqual(interval.rejected.map((r) => r.field), ["intervalMinutes"]);

  const duration = planSecondInstance({ command: "now", durationSeconds: 99999, provided: { command: true, duration: true } });
  assert.deepEqual(duration.actions, [{ type: "show" }], "no one-off duration applied");
  assert.deepEqual(duration.rejected.map((r) => r.field), ["durationSeconds"]);
});

test("non-boolean demo/screenshot are dropped", () => {
  const fields = rejectedFields({ command: "live", demo: "yes", screenshot: 1, provided: { command: true } });
  assert.ok(fields.includes("demo") && fields.includes("screenshot"));
});

test("an empty --verse on a second instance is rejected, not shown", () => {
  const result = planSecondInstance(readConfig(["--verse="]));
  assert.ok(!result.actions.some((a) => a.type === "show"), "no darshan for an empty verse");
  assert.deepEqual(result.rejected.map((r) => r.field), ["verse"]);
});

test("an unknown top-level key is dropped and reported", () => {
  const result = planSecondInstance({ command: "now", provided: { command: true }, evil: 1 });
  assert.deepEqual(result.actions, [{ type: "show" }], "still acts on the known fields");
  assert.deepEqual(result.rejected.map((r) => r.field), ["evil"]);
});

test("a clean config rejects nothing", () => {
  assert.deepEqual(planSecondInstance(readConfig(["--command=pause"])).rejected, []);
});

test("leading-zero verse is still accepted through the whitelist", () => {
  const result = planSecondInstance({ command: "now", verse: "02.47", provided: { command: true, verse: true } });
  assert.deepEqual(result.actions, [{ type: "show", verse: "02.47" }]);
  assert.deepEqual(result.rejected, []);
});

test("missing or malformed config is handled without crashing", () => {
  assert.deepEqual(planSecondInstance(null), { actions: [], rejected: [] });
  assert.deepEqual(planSecondInstance(undefined), { actions: [], rejected: [] });
  assert.deepEqual(planSecondInstance("nope"), { actions: [], rejected: [] });
  // An empty object with no fields: default command is now, so it shows.
  assert.deepEqual(planSecondInstance({}).actions, [{ type: "show" }]);
});
