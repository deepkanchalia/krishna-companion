"use strict";

const fs = require("node:fs");

// Block until the companion records a `now` acknowledgement newer than t0, or the
// budget elapses. The companion writes state.json with lastCommand.receivedAt when
// a `now` reaches it (src/main.js), so a fresh stamp proves the command arrived.
// Returns true on acknowledgement, false on timeout. Kept out of bin/krshna.js so a
// test can import it without running the CLI or requiring electron.
function waitForAck(stateFile, t0, budgetMs, intervalMs = 100) {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    let receivedAt = NaN;
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      receivedAt = Date.parse(state?.lastCommand?.receivedAt);
    } catch {
      receivedAt = NaN;
    }
    if (Number.isFinite(receivedAt) && receivedAt > t0) return true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    sleepSync(Math.min(intervalMs, remaining));
  }
}

// Synchronous sleep with no dependency: park on a private lock that is never woken.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// A `now` invocation should acknowledge (which blocks the prompt in the hook) only
// when there is a live window able to show the darshan. If the window is missing or
// destroyed, we skip the ack: the CLI then exits 2 and the hook passes the prompt
// through, rather than swallowing it with nothing on screen. Pure so main.js can be
// tested for this decision without launching Electron.
function windowCanAcknowledge(window) {
  return Boolean(window) && typeof window.isDestroyed === "function" && !window.isDestroyed();
}

module.exports = { waitForAck, windowCanAcknowledge };
