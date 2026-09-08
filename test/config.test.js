const test = require("node:test");
const assert = require("node:assert/strict");
const { numberArgument, readConfig } = require("../src/config");

test("uses the requested interval and duration", () => {
  assert.deepEqual(readConfig(["--interval=45", "--duration=24"]), {
    demo: false,
    screenshot: false,
    verse: undefined,
    command: "live",
    intervalMinutes: 45,
    durationSeconds: 24,
    provided: {
      command: false,
      verse: false,
      demo: false,
      screenshot: false,
      interval: true,
      duration: true
    }
  });
});

test("records which options a launch actually provided", () => {
  assert.deepEqual(readConfig([]).provided, {
    command: false, verse: false, demo: false, screenshot: false, interval: false, duration: false
  });
  const full = readConfig(["--command=now", "--verse=2.47", "--interval=60", "--duration=10", "--demo", "--screenshot"]);
  assert.deepEqual(full.provided, {
    command: true, verse: true, demo: true, screenshot: true, interval: true, duration: true
  });
});

test("teachings stay open by default and duration is opt-in", () => {
  assert.equal(readConfig([]).durationSeconds, 0);
  assert.equal(readConfig(["--duration=18"]).durationSeconds, 18);
});

test("enables demo mode", () => {
  const config = readConfig(["--demo", "--screenshot", "--command=now"]);
  assert.equal(config.demo, true);
  assert.equal(config.screenshot, true);
  assert.equal(config.command, "now");
});

test("a demo without an explicit command asks a live instance for a reflection now", () => {
  assert.equal(readConfig(["--demo"]).command, "now");
  assert.equal(readConfig([]).command, "live");
  assert.equal(readConfig(["--demo", "--verse=1.32-35"]).verse, "1.32-35");
});

test("falls back for non-numeric arguments and clamps unsafe values", () => {
  assert.equal(numberArgument(["--interval=nope"], "interval", 30, 0.1, 1440), 30);
  assert.equal(numberArgument(["--duration=-1"], "duration", 0, 0, 120), 0);
  assert.equal(numberArgument(["--duration=999"], "duration", 0, 0, 120), 120);
});
