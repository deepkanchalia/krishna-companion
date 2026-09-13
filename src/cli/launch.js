"use strict";

// Launching and forwarding. Every `krshna` verb that acts on the app spawns a detached
// Electron process; the single-instance lock (src/main.js) decides whether it becomes the
// live app or a short-lived forwarder. runNow/runLive take their launcher injected so a test
// can drive them with a fake launcher and clock, without Electron (CLAUDE.md).
const { spawn } = require("node:child_process");
const { waitForAck } = require("../ack");
const { stateFile } = require("./data-files");

// How long `krshna now` waits for the companion to stamp state.json before giving up with
// exit code 2. Deliberately below the hook's ACK_TIMEOUT_MS (scripts/krshna-hook.js,
// 6000 ms): the hook spawns this CLI, so the CLI must time out and report first, leaving the
// hook to pass the prompt through rather than force-killing a CLI still waiting.
const ACK_BUDGET_MS = 4000;

// Spawn a detached Electron for `nextCommand`. Returns false (after one stderr line) when
// Electron is not installed, so the caller reports rather than claiming a launch happened.
function launch(projectRoot, nextCommand) {
  let electronPath;
  try {
    electronPath = require("electron");
  } catch {
    console.error("Electron is not installed. Run `npm install` in the Krishna Companion project.");
    process.exitCode = 1;
    return false;
  }

  const child = spawn(electronPath, [projectRoot, `--command=${nextCommand}`], {
    detached: true,
    stdio: "ignore",
    cwd: projectRoot
  });
  child.unref();
  return true;
}

// Launch or forward a `now` invocation and wait for the companion to acknowledge by stamping
// state.json. Returns the exit code: 0 on ack, 1 if the launcher could not start, 2 on
// timeout (with one stderr line).
function runNow({ launch: launchFn, stateFile: stateFilePath = stateFile(), clock = Date.now, budgetMs = ACK_BUDGET_MS } = {}) {
  const t0 = clock();
  if (!launchFn("now")) return 1; // launcher missing: launch() already set the message
  if (waitForAck(stateFilePath, t0, budgetMs)) return 0;
  process.stderr.write(`companion did not acknowledge within ${budgetMs / 1000} s\n`);
  return 2;
}

// Launch the companion for `live`/`start`, claiming it is live only when the launch actually
// succeeded. Returns the exit code: 0 on success, 1 when launch() could not start the app
// (launch() has already written the specific reason to stderr).
function runLive(nextCommand, { launch: launchFn } = {}) {
  if (!launchFn(nextCommand)) return 1;
  console.log("🪶 Kṛṣṇa Companion is live. Your terminal work will continue normally.");
  return 0;
}

module.exports = { launch, runNow, runLive, ACK_BUDGET_MS };
