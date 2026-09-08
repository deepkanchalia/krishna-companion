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

module.exports = { waitForAck };
