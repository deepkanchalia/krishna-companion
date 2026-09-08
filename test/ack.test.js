const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { waitForAck, windowCanAcknowledge } = require("../src/ack");

// waitForAck backs the CLI's `now` poll: exit 0 when the companion stamps state.json
// with a lastCommand newer than t0, exit 2 otherwise. This exercises it directly, so
// no Electron app is launched (CLAUDE.md: tests never start the app).
function tempStateFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-ack-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "state.json");
}

test("returns true once state.json carries an acknowledgement newer than t0 (exit 0)", (t) => {
  const stateFile = tempStateFile(t);
  const t0 = Date.now();
  // The companion writes state.json shortly after launch; simulate that stamp.
  fs.writeFileSync(stateFile, JSON.stringify({
    live: true,
    lastCommand: { name: "now", receivedAt: new Date(t0 + 5).toISOString() }
  }));
  assert.equal(waitForAck(stateFile, t0, 4000), true);
});

test("returns false when no fresh acknowledgement appears within the budget (exit 2)", (t) => {
  const stateFile = tempStateFile(t);
  const t0 = Date.now();
  // A stale stamp (from before t0) and a missing file must both time out.
  fs.writeFileSync(stateFile, JSON.stringify({
    live: true,
    lastCommand: { name: "now", receivedAt: new Date(t0 - 1000).toISOString() }
  }));
  assert.equal(waitForAck(stateFile, t0, 300), false);

  const missing = path.join(path.dirname(stateFile), "absent.json");
  assert.equal(waitForAck(missing, t0, 300), false);
});

test("windowCanAcknowledge: ack only when a live window is present", () => {
  // Present and not destroyed -> acknowledge (block the prompt, show the darshan).
  assert.equal(windowCanAcknowledge({ isDestroyed: () => false }), true);
  // Missing window -> no ack, so the CLI exits 2 and the hook passes through.
  assert.equal(windowCanAcknowledge(undefined), false);
  assert.equal(windowCanAcknowledge(null), false);
  // Destroyed window -> no ack.
  assert.equal(windowCanAcknowledge({ isDestroyed: () => true }), false);
});
