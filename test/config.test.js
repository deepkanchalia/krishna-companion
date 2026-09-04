const test = require("node:test");
const assert = require("node:assert/strict");
const { numberArgument, readConfig } = require("../src/config");

test("uses the requested interval and duration", () => {
  assert.deepEqual(readConfig(["--interval=45", "--duration=24"]), {
    demo: false,
    screenshot: false,
    command: "live",
    intervalMinutes: 45,
    durationSeconds: 24
  });
});

test("enables demo mode", () => {
  const config = readConfig(["--demo", "--screenshot", "--command=now"]);
  assert.equal(config.demo, true);
  assert.equal(config.screenshot, true);
  assert.equal(config.command, "now");
});

test("falls back for non-numeric arguments and clamps unsafe values", () => {
  assert.equal(numberArgument(["--interval=nope"], "interval", 30, 0.1, 1440), 30);
  assert.equal(numberArgument(["--duration=1"], "duration", 18, 5, 120), 5);
  assert.equal(numberArgument(["--duration=999"], "duration", 18, 5, 120), 120);
});
