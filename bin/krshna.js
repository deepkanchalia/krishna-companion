#!/usr/bin/env node

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { reflections } = require("../src/content");

const projectRoot = path.resolve(__dirname, "..");
const rawCommand = (process.argv[2] || "live").toLowerCase();
const command = rawCommand.replace(/^\//, "");

function appDataDirectory() {
  const appDirectory = "krishna-companion";
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appDirectory);
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appDirectory);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), appDirectory);
}

function stateFile() {
  return path.join(appDataDirectory(), "state.json");
}

function journeyFile() {
  return path.join(appDataDirectory(), "journey.json");
}

function readState() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (!state.live || !state.pid) return { live: false };
  } catch {
    return { live: false };
  }

  try {
    process.kill(state.pid, 0);
  } catch (error) {
    // Managed terminals can deny process inspection even when the app is live.
    if (error.code !== "EPERM") return { live: false };
  }
  return state;
}

function timeUntil(timestamp) {
  if (!timestamp) return "soon";
  const minutes = Math.max(0, Math.ceil((timestamp - Date.now()) / 60000));
  return minutes < 1 ? "<1m" : `${minutes}m`;
}

function promptStatus() {
  const state = readState();
  if (!state.live) return;
  const status = state.paused ? "paused" : `${timeUntil(state.nextReflectionAt)}`;
  process.stdout.write(`🪶 Kṛṣṇa · ${status}`);
}

function printStatus() {
  const state = readState();
  if (!state.live) {
    console.log("Kṛṣṇa Companion is not running. Start it with: krshna");
    return;
  }

  console.log(`Kṛṣṇa Companion is live (PID ${state.pid}).`);
  console.log(state.paused
    ? "Reflections are paused."
    : `Next reflection in ${timeUntil(state.nextReflectionAt)}; cadence ${state.intervalMinutes} minutes.`);
  if (state.nextReference) console.log(`Next in sequence: ${state.nextReference}.`);
}

function printContext() {
  let savedJourney;
  try {
    savedJourney = JSON.parse(fs.readFileSync(journeyFile(), "utf8"));
  } catch {
    console.log("No teaching has been shown yet. The journey will begin with Bhagavad-gītā As It Is 1.1.");
    return;
  }

  const last = savedJourney.history?.at(-1);
  if (!last) {
    console.log("No teaching has been shown yet. The journey will begin with Bhagavad-gītā As It Is 1.1.");
    return;
  }
  console.log(`Last explained: ${last.reference}`);
  console.log(last.explanation.replace("\n", " "));
  console.log(`Next in sequence: ${reflections[savedJourney.nextVerseIndex]?.reference || "the opening verse"}.`);
}

function launch(nextCommand) {
  let electronPath;
  try {
    electronPath = require("electron");
  } catch {
    console.error("Electron is not installed. Run `npm install` in the Krishna Companion project.");
    process.exitCode = 1;
    return;
  }

  const child = spawn(electronPath, [projectRoot, `--command=${nextCommand}`], {
    detached: true,
    stdio: "ignore",
    cwd: projectRoot
  });
  child.unref();
}

function installZsh() {
  const zshrc = path.join(os.homedir(), ".zshrc");
  const sourcePath = path.join(projectRoot, "shell", "krshna.zsh");
  const start = "# >>> krshna companion >>>";
  const existing = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, "utf8") : "";
  if (!existing.includes(start)) {
    const backup = `${zshrc}.krshna-backup`;
    if (fs.existsSync(zshrc) && !fs.existsSync(backup)) fs.copyFileSync(zshrc, backup);
    const prefix = existing.length && !existing.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(zshrc, `${prefix}${start}\nsource ${JSON.stringify(sourcePath)}\n# <<< krshna companion <<<\n`);
  }
  console.log("Installed the /krshna shortcut and terminal status. Open a new terminal to use them.");
}

function help() {
  console.log(`
Krishna Companion

  krshna             Make the companion live
  krshna now         Invite a reflection now
  krshna pause       Pause scheduled reflections
  krshna resume      Resume the companion
  krshna status      Show its current state
  krshna context     Recall the last explanation and next verse
  krshna stop        Stop the companion
  krshna install     Add /krshna and a status to zsh
`);
}

switch (command) {
  case "prompt":
    promptStatus();
    break;
  case "status":
    printStatus();
    break;
  case "context":
    printContext();
    break;
  case "install":
    installZsh();
    break;
  case "help":
  case "--help":
  case "-h":
    help();
    break;
  case "live":
  case "start":
  case "now":
    launch(command);
    if (command !== "now") {
      console.log("🪶 Kṛṣṇa Companion is live. Your terminal work will continue normally.");
    }
    break;
  case "pause":
  case "resume":
  case "stop":
    if (!readState().live) {
      console.log("Kṛṣṇa Companion is not running. Start it with: krshna");
      break;
    }
    launch(command);
    break;
  default:
    console.error(`Unknown command: ${rawCommand}`);
    help();
    process.exitCode = 1;
}
