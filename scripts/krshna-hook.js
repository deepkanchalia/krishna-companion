#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { matchesInvocation } = require("../src/voice");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("error", () => {});
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    if (!matchesInvocation(payload?.prompt)) return;

    try {
      const child = spawn("krshna", ["now"], {
        detached: true,
        stdio: "ignore"
      });
      child.on("error", () => {});
      child.unref();
    } catch {}

    process.stdout.write(JSON.stringify({ decision: "block", reason: "Hare Kṛṣṇa" }));
  } catch {}
});
