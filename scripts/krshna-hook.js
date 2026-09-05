#!/usr/bin/env node

const path = require("node:path");
const { spawn } = require("node:child_process");
const { matchesInvocation } = require("../src/voice");

// Resolve the CLI by absolute path so the hook never depends on PATH, and start
// the companion with this same Node. The block decision is only printed once the
// child has spawned cleanly; if it fails to start, the prompt passes through
// untouched (fail-open) and Claude Code processes it normally.
const nodeBinary = process.env.KRSHNA_HOOK_NODE || process.execPath;
const cli = path.join(__dirname, "..", "bin", "krshna.js");
const SPAWN_GRACE_MS = 300;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
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
    child = spawn(nodeBinary, [cli, "now"], { detached: true, stdio: "ignore" });
  } catch (error) {
    process.stderr.write(`krshna-hook: could not start companion (${error.message})\n`);
    return; // Fail open: no block decision, prompt passes through.
  }

  let failed = false;
  child.on("error", (error) => {
    failed = true;
    process.stderr.write(`krshna-hook: could not start companion (${error.message})\n`);
  });

  // The "error" event (e.g. ENOENT) arrives on the next tick(s); wait a short
  // grace period before trusting that the child actually launched.
  setTimeout(() => {
    if (failed) return;
    child.unref();
    process.stdout.write(JSON.stringify({ decision: "block", reason: "Hare Kṛṣṇa" }));
  }, SPAWN_GRACE_MS);
});
