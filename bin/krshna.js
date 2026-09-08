#!/usr/bin/env node

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { reflections } = require("../src/content");
const { isValidHistoryEntry } = require("../src/journey");
const { waitForAck } = require("../src/ack");

const projectRoot = path.resolve(__dirname, "..");
const rawCommand = (process.argv[2] || "live").toLowerCase();
const voiceAction = (process.argv[3] || "").toLowerCase();
const command = rawCommand === "voice" ? `voice-${voiceAction}` : rawCommand.replace(/^\//, "");

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

  const history = Array.isArray(savedJourney.history) ? savedJourney.history : [];
  const readable = history.filter(isValidHistoryEntry);
  const unreadable = history.length - readable.length;
  if (unreadable > 0) {
    console.log(`Note: journey has ${unreadable} unreadable ${unreadable === 1 ? "entry" : "entries"}; skipping.`);
  }

  const last = readable.at(-1);
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

const ZSH_START = "# >>> krshna companion >>>";
const ZSH_END = "# <<< krshna companion <<<";

function zshrcFile() {
  return path.join(os.homedir(), ".zshrc");
}

function zshBlock() {
  const sourcePath = path.join(projectRoot, "shell", "krshna.zsh");
  return `${ZSH_START}\nsource ${JSON.stringify(sourcePath)}\n${ZSH_END}`;
}

function installZsh() {
  const zshrc = zshrcFile();
  const existing = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, "utf8") : "";
  const backup = `${zshrc}.krshna-backup`;
  if (fs.existsSync(zshrc) && !fs.existsSync(backup)) fs.copyFileSync(zshrc, backup);

  const startIndex = existing.indexOf(ZSH_START);
  const endIndex = existing.indexOf(ZSH_END, startIndex);
  if (startIndex !== -1 && endIndex !== -1) {
    // Replace the existing block in place so a moved checkout points at the current
    // path instead of accumulating a second block.
    const after = endIndex + ZSH_END.length;
    fs.writeFileSync(zshrc, existing.slice(0, startIndex) + zshBlock() + existing.slice(after));
    return;
  }
  const prefix = existing.length && !existing.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(zshrc, `${prefix}${zshBlock()}\n`);
}

// Remove the marked block, including its markers and the newline the install wrote
// after it, leaving every other byte of .zshrc untouched. Returns the removed text,
// or null when there is no block.
function uninstallZsh() {
  const zshrc = zshrcFile();
  if (!fs.existsSync(zshrc)) return null;
  const existing = fs.readFileSync(zshrc, "utf8");
  const startIndex = existing.indexOf(ZSH_START);
  const endIndex = existing.indexOf(ZSH_END, startIndex);
  if (startIndex === -1 || endIndex === -1) return null;
  let after = endIndex + ZSH_END.length;
  const removed = existing.slice(startIndex, after);
  if (existing[after] === "\n") after += 1;
  fs.writeFileSync(zshrc, existing.slice(0, startIndex) + existing.slice(after));
  return removed;
}

function claudeSettingsFile() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

// Marker carried by every hook entry we install, so we can find (and replace or
// remove) our own entry regardless of which Node binary or checkout path produced
// it. The command both contains krshna-hook.js and sets KRSHNA_HOOK=1.
const CLAUDE_HOOK_MARKER = "KRSHNA_HOOK=1";

function claudeHookCommand() {
  const hookPath = path.join(projectRoot, "scripts", "krshna-hook.js");
  return `${CLAUDE_HOOK_MARKER} ${JSON.stringify(process.execPath)} ${JSON.stringify(hookPath)}`;
}

function isKrshnaHook(hook) {
  return hook?.type === "command"
    && typeof hook.command === "string"
    && hook.command.includes(CLAUDE_HOOK_MARKER)
    && hook.command.includes("krshna-hook.js");
}

// Remove every marker-matching hook from a UserPromptSubmit list, dropping any
// group left empty. Returns the rewritten list and whether anything changed.
function stripKrshnaHooks(list) {
  let changed = false;
  const result = list.flatMap((group) => {
    if (!Array.isArray(group?.hooks)) return [group];
    const hooks = group.hooks.filter((hook) => !isKrshnaHook(hook));
    if (hooks.length === group.hooks.length) return [group];
    changed = true;
    return hooks.length ? [{ ...group, hooks }] : [];
  });
  return { result, changed };
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

// Read the file, apply the mutation to that fresh content, then tmp+rename. Reading
// immediately before the write keeps a concurrent change to the same file from
// being clobbered by stale in-memory content. `mutate` returns the value to write,
// or undefined to skip the write.
function updateJsonFile(filePath, fallback, mutate) {
  const next = mutate(readJsonFile(filePath, fallback));
  if (next === undefined) return false;
  writeJsonFile(filePath, next);
  return true;
}

function installClaudeHook() {
  const settingsFile = claudeSettingsFile();
  const backupFile = `${settingsFile}.krshna-backup`;
  if (fs.existsSync(settingsFile) && !fs.existsSync(backupFile)) fs.copyFileSync(settingsFile, backupFile);

  updateJsonFile(settingsFile, {}, (settings) => {
    settings.hooks ||= {};
    settings.hooks.UserPromptSubmit ||= [];
    // Replace any prior marker entry (e.g. from a different checkout or Node) so we
    // never accumulate duplicates, then append exactly one fresh entry.
    const { result } = stripKrshnaHooks(settings.hooks.UserPromptSubmit);
    result.push({
      matcher: "",
      hooks: [{ type: "command", command: claudeHookCommand() }]
    });
    settings.hooks.UserPromptSubmit = result;
    return settings;
  });
}

function uninstallClaudeHook() {
  updateJsonFile(claudeSettingsFile(), null, (settings) => {
    if (!settings || !Array.isArray(settings.hooks?.UserPromptSubmit)) return undefined;
    // Remove every marker match regardless of the Node or checkout path that wrote it.
    const { result, changed } = stripKrshnaHooks(settings.hooks.UserPromptSubmit);
    if (!changed) return undefined;
    settings.hooks.UserPromptSubmit = result;
    if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    return settings;
  });
}

function install() {
  installZsh();
  installClaudeHook();
  console.log("Installed the /krshna shortcut, terminal status, and Claude Code voice hook.");
  console.log("Open a new terminal to use the shell integrations.");
}

function uninstall() {
  uninstallClaudeHook();
  const removedZsh = uninstallZsh();
  console.log("Removed the Krishna Companion Claude Code voice hook.");
  console.log(removedZsh
    ? "Removed the zsh integration block from ~/.zshrc (backup left in place)."
    : "No zsh integration block was present in ~/.zshrc.");
}

function help() {
  console.log(`
Krishna Companion

  krshna             Make the companion live
  krshna start       Alias of krshna (make the companion live)
  krshna now         Invite a reflection now
  krshna pause       Pause scheduled reflections
  krshna resume      Resume the companion
  krshna status      Show its current state
  krshna context     Recall the last explanation and next verse
  krshna voice on    Enable hold-Space voice
  krshna voice off   Disable hold-Space voice
  krshna stop        Stop the companion
  krshna install     Add /krshna, terminal status, and the Claude Code voice hook
  krshna uninstall   Remove the zsh integration and the Claude Code voice hook
`);
}

switch (command) {
  case "status":
    printStatus();
    break;
  case "context":
    printContext();
    break;
  case "install":
    install();
    break;
  case "uninstall":
    uninstall();
    break;
  case "help":
  case "--help":
  case "-h":
    help();
    break;
  case "now": {
    // Launch or forward, then wait for the companion to stamp state.json before
    // returning, so the Claude Code hook knows the invocation was received.
    const t0 = Date.now();
    if (!launch("now")) break; // electron missing: exit code already set
    if (waitForAck(stateFile(), t0, 4000)) {
      process.exitCode = 0;
    } else {
      process.stderr.write("companion did not acknowledge within 4 s\n");
      process.exitCode = 2;
    }
    break;
  }
  case "live":
  case "start":
    launch(command);
    console.log("🪶 Kṛṣṇa Companion is live. Your terminal work will continue normally.");
    break;
  case "pause":
  case "resume":
  case "voice-on":
  case "voice-off":
  case "stop":
    if (!readState().live) {
      console.log("Kṛṣṇa Companion is not running. Start it with: krshna");
      break;
    }
    launch(command);
    break;
  case "voice-":
    console.error("Usage: krshna voice on|off");
    process.exitCode = 1;
    break;
  default:
    console.error(`Unknown command: ${rawCommand}`);
    help();
    process.exitCode = 1;
}
