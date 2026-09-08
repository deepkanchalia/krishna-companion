#!/usr/bin/env node

const path = require("node:path");
const { spawn } = require("node:child_process");
const { matchesInvocation } = require("../src/voice");

// Resolve the CLI by absolute path so the hook never depends on PATH, and run it
// with this same Node. Unlike the fire-and-forget spawn this replaced, the hook now
// waits for `krshna now` to exit: the companion acknowledges the invocation (by
// stamping state.json) and the CLI exits 0 only then. The block decision is printed
// only on that clean exit. Any other exit, a spawn error, or a timeout passes the
// prompt through untouched (fail-open) so Claude Code processes it normally.
const nodeBinary = process.env.KRSHNA_HOOK_NODE || process.execPath;
const cli = path.join(__dirname, "..", "bin", "krshna.js");
const MAX_INPUT_BYTES = 64 * 1024;
const ACK_TIMEOUT_MS = 6000;

let input = "";
let overflowed = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (overflowed) return;
  input += chunk;
  // Cap the payload: a prompt this large is never the bare invocation, so stop
  // reading and let it pass through.
  if (Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES) {
    overflowed = true;
    input = "";
  }
});
process.stdin.on("error", () => {});
process.stdin.on("end", () => {
  if (overflowed) return; // Oversized payload: pass through silently.

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
    process.stderr.write(`krshna-hook: could not start companion (${error.message})\n`);
    return; // Fail open: no block decision, prompt passes through.
  }

  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    // Ask the child to stop, escalate to SIGKILL if it ignores that, and unref it
    // so it can no longer hold this process open. Then pass the prompt through
    // (nothing on stdout) and exit now instead of waiting out the child.
    try { child.kill("SIGTERM"); } catch {}
    const hardKill = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 500);
    hardKill.unref?.();
    child.unref?.();
    process.stderr.write("krshna-hook: companion did not acknowledge within 6 s\n");
    process.exit(0);
  }, ACK_TIMEOUT_MS);
  timer.unref?.();

  child.on("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    process.stderr.write(`krshna-hook: could not start companion (${error.message})\n`);
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
