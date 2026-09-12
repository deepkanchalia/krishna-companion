#!/usr/bin/env node

const path = require("node:path");
const { spawn } = require("node:child_process");
const { matchesInvocation } = require("../src/voice");
const { safeLabel } = require("../src/sanitize");

// Resolve the CLI by absolute path so the hook never depends on PATH, and run it
// with this same Node. Unlike the fire-and-forget spawn this replaced, the hook now
// waits for `krshna now` to exit: the companion acknowledges the invocation (by
// stamping state.json) and the CLI exits 0 only then. The block decision is printed
// only on that clean exit. Any other exit, a spawn error, or a timeout passes the
// prompt through untouched (fail-open) so Claude Code processes it normally.
const nodeBinary = process.env.KRSHNA_HOOK_NODE || process.execPath;
const cli = path.join(__dirname, "..", "bin", "krshna.js");
const MAX_INPUT_BYTES = 64 * 1024;
// How long the hook waits for `krshna now` to acknowledge before it force-kills the child
// and passes the prompt through. The production default is 6000 ms; KRSHNA_ACK_TIMEOUT_MS
// overrides it (finite and positive only, otherwise ignored) so a test need not spend the
// full budget proving the timeout path.
const DEFAULT_ACK_TIMEOUT_MS = 6000;
function ackTimeoutMs() {
  const override = Number(process.env.KRSHNA_ACK_TIMEOUT_MS);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_ACK_TIMEOUT_MS;
}
const ACK_TIMEOUT_MS = ackTimeoutMs();

// Exported for the unit test (which asserts the production default and the override
// validation without spending the full budget); the stdin runtime below runs only when
// this file is executed directly as the hook.
module.exports = { ackTimeoutMs, DEFAULT_ACK_TIMEOUT_MS };

if (require.main === module) runHook();

function runHook() {
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  // A prompt this large is never the bare invocation. Stop reading and pass it
  // through at once, without waiting for an EOF that may never come.
  if (Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES) {
    process.stdin.destroy();
    process.exit(0);
  }
});
process.stdin.on("error", () => {});
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return; // Unreadable payload: pass through silently.
  }
  if (!matchesInvocation(payload?.prompt)) return;

  let child;
  try {
    child = spawn(nodeBinary, [cli, "now"], { stdio: "ignore" });
  } catch (error) {
    // error.message can embed an environment-controlled path (KRSHNA_HOOK_NODE), so strip
    // control characters through safeLabel before it reaches a terminal line.
    process.stderr.write(`krshna-hook: could not start companion (${safeLabel(error.message, 200)})\n`);
    return; // Fail open: no block decision, prompt passes through.
  }

  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    // Ask the child to stop; if it ignores SIGTERM, wait 500 ms and SIGKILL it, then
    // pass the prompt through (nothing on stdout) and exit. Staying alive for the
    // escalation keeps the child from being orphaned; total budget stays 500 ms over
    // ACK_TIMEOUT_MS.
    process.stderr.write(`krshna-hook: companion did not acknowledge within ${ACK_TIMEOUT_MS / 1000} s\n`);
    try { child.kill("SIGTERM"); } catch { /* already exited */ }
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* already exited */ }
      process.exit(0);
    }, 500);
  }, ACK_TIMEOUT_MS);
  timer.unref?.();

  child.on("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    process.stderr.write(`krshna-hook: could not start companion (${safeLabel(error.message, 200)})\n`);
  });
  child.on("exit", (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (code === 0) {
      process.stdout.write(JSON.stringify({ decision: "block", reason: "Hare Kṛṣṇa" }));
    } else {
      process.stderr.write("krshna-hook: companion did not acknowledge\n");
    }
  });
});
}
