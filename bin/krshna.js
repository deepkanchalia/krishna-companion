#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { reflections } = require("../src/content");
const { isValidHistoryEntry } = require("../src/journey");
const { waitForAck } = require("../src/ack");
const { readJson: readJsonQuarantine, writeJson } = require("../src/store");
const { FIGURE_STYLES } = require("../src/config");
const { homeDirectory, appDataDirectory } = require("../src/paths");

const projectRoot = path.resolve(__dirname, "..");
const rawCommand = (process.argv[2] || "live").toLowerCase();
const voiceAction = (process.argv[3] || "").toLowerCase();
// `krshna voice on|off` and `krshna style <name>` fold into the single-word commands the
// app accepts (voice-on, style-cartoon); the style name is validated below against
// FIGURE_STYLES, the one list shared with the app.
const command = rawCommand === "voice" ? `voice-${voiceAction}`
  : rawCommand === "style" ? `style-${voiceAction}`
  : rawCommand.replace(/^\//, "");

// homeDirectory and appDataDirectory come from src/paths.js, the single source shared
// with the running app (src/main.js). See that file for the KRSHNA_HOME redirection.

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
    ? "Teachings are paused."
    : `Next teaching in ${timeUntil(state.nextReflectionAt)}; cadence ${state.intervalMinutes} minutes.`);
  if (state.nextReference) console.log(`Next in sequence: ${state.nextReference}.`);
}

// One line if the app moved any damaged data file aside (store.js quarantine). The
// names are our own <name>.corrupt-<timestamp>.json files, never outside text.
function reportQuarantinedFiles() {
  let entries;
  try {
    entries = fs.readdirSync(appDataDirectory());
  } catch {
    return;
  }
  // Only our own quarantine files, matched strictly, so a hostile filename dropped in
  // the data directory can never be echoed to the terminal.
  const CORRUPT_NAME = /^(state|journey|settings)\.corrupt-[0-9TZ-]+(-\d+)?(\.\d+)?\.json$/;
  const corrupt = entries.filter((name) => CORRUPT_NAME.test(name)).sort();
  if (corrupt.length === 0) return;
  const noun = corrupt.length === 1 ? "file was" : "files were";
  console.log(`Note: ${corrupt.length} damaged data ${noun} kept aside (${corrupt.join(", ")}).`);
}

// Launch or forward a `now` invocation and wait for the companion to acknowledge by
// stamping state.json. Returns the exit code: 0 on ack, 1 if the launcher could not
// start, 2 on timeout (with one stderr line). Dependencies are injectable so a test
// can drive it with a fake launcher and clock, without Electron.
// How long `krshna now` waits for the companion to stamp state.json before giving up
// with exit code 2. Deliberately below the hook's ACK_TIMEOUT_MS (scripts/krshna-hook.js,
// 6000 ms): the hook spawns this CLI, so the CLI must time out and report first, leaving
// the hook to pass the prompt through rather than force-killing a CLI still waiting.
const ACK_BUDGET_MS = 4000;

function runNow({
  launch: launchFn = launch,
  stateFile: stateFilePath = stateFile(),
  clock = Date.now,
  budgetMs = ACK_BUDGET_MS
} = {}) {
  const t0 = clock();
  if (!launchFn("now")) return 1; // launcher missing: launch() already set the message
  if (waitForAck(stateFilePath, t0, budgetMs)) return 0;
  process.stderr.write(`companion did not acknowledge within ${budgetMs / 1000} s\n`);
  return 2;
}

function printContext() {
  reportQuarantinedFiles();
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
  return path.join(homeDirectory(), ".zshrc");
}

function zshBlock() {
  const sourcePath = path.join(projectRoot, "shell", "krshna.zsh");
  return `${ZSH_START}\nsource ${JSON.stringify(sourcePath)}\n${ZSH_END}`;
}

function installZsh() {
  const zshrc = zshrcFile();
  const existing = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, "utf8") : "";
  const backup = `${zshrc}.krshna-backup`;
  // Refresh the backup on every install so it tracks the user's current .zshrc, but store
  // it with our own block stripped: a restore must return their file, not one that already
  // carries our integration. The backup keeps the original's file mode.
  if (fs.existsSync(zshrc)) {
    fs.writeFileSync(backup, zshWithoutBlock(existing).content);
    fs.chmodSync(backup, fs.statSync(zshrc).mode & 0o777);
  }

  const startIndex = existing.indexOf(ZSH_START);
  const endIndex = existing.indexOf(ZSH_END, startIndex);
  if (startIndex !== -1 && endIndex !== -1) {
    // Replace the existing block in place so a moved checkout points at the current
    // path instead of accumulating a second block.
    const after = endIndex + ZSH_END.length;
    fs.writeFileSync(zshrc, existing.slice(0, startIndex) + zshBlock() + existing.slice(after));
    return;
  }
  // Always separate the block from prior content with exactly one newline (even when
  // the file already ends in one); uninstallZsh strips that same newline back, so a
  // file with or without a trailing newline round-trips byte-identical.
  const prefix = existing.length ? "\n" : "";
  fs.appendFileSync(zshrc, `${prefix}${zshBlock()}\n`);
}

// Remove the marked block, including its markers and the newline install wrote after
// it, leaving every other byte of .zshrc untouched. Returns the removed text, or null
// when there is no block.
//
// The single separator newline install writes before the block is stripped ONLY when
// the block is the last thing in the file (as install always appends it). For a block
// that sits mid-file — a pre-B1 legacy block, or one a user moved — the newline before
// it belongs to the preceding line, so stripping it would merge two lines; there we
// leave it, keeping the surrounding content byte-identical.
//
// One legacy case is inherently byte-ambiguous and cannot be perfectly restored: a
// pre-B1 block appended directly after a newline-terminated file produces the exact same
// bytes as a B1 install onto a file with no trailing newline (`…\n# >>>…\n`). Both look
// like "one separator newline before a block at EOF", so uninstall strips that newline —
// correct for the B1 case, but it drops the pre-B1 file's final newline. This affects
// only that one shape and only the trailing newline; every other byte is preserved.
// Pure: return the .zshrc content with our marked block removed, and the removed text
// (removed is null when there is no block). Shared by uninstallZsh and by the install
// backup, so the backup can be stored without our block.
function zshWithoutBlock(existing) {
  const startIndex = existing.indexOf(ZSH_START);
  const endIndex = existing.indexOf(ZSH_END, startIndex);
  if (startIndex === -1 || endIndex === -1) return { content: existing, removed: null };
  let after = endIndex + ZSH_END.length;
  const removed = existing.slice(startIndex, after);
  if (existing[after] === "\n") after += 1; // the newline install wrote after the block
  let before = startIndex;
  // Only strip the leading separator when nothing follows the block (block at EOF),
  // which is where install put it; otherwise removing it would join two lines.
  if (after >= existing.length && before > 0 && existing[before - 1] === "\n") before -= 1;
  return { content: existing.slice(0, before) + existing.slice(after), removed };
}

function uninstallZsh() {
  const zshrc = zshrcFile();
  if (!fs.existsSync(zshrc)) return null;
  const { content, removed } = zshWithoutBlock(fs.readFileSync(zshrc, "utf8"));
  if (removed === null) return null;
  fs.writeFileSync(zshrc, content);
  return removed;
}

function claudeSettingsFile() {
  return path.join(homeDirectory(), ".claude", "settings.json");
}

// Marker carried by every hook entry we install, so we can find (and replace or
// remove) our own entry regardless of which Node binary or checkout path produced
// it. The command both contains krshna-hook.js and sets KRSHNA_HOOK=1.
const CLAUDE_HOOK_MARKER = "KRSHNA_HOOK=1";

// POSIX single-quote a value so the shell that runs the hook takes it literally: single
// quotes protect everything (spaces, $, backticks, double quotes) except a single quote,
// which is closed, escaped as \', and reopened. JSON.stringify's double quotes would let
// the shell expand a $ or backtick inside a checkout path, so this is used instead.
function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function claudeHookCommand() {
  const hookPath = path.join(projectRoot, "scripts", "krshna-hook.js");
  return `${CLAUDE_HOOK_MARKER} ${shQuote(process.execPath)} ${shQuote(hookPath)}`;
}

// The script path a hook must end in to be ours (POSIX slash or Windows backslash, the
// latter doubled by JSON.stringify). Anchored to the token end so .../krshna-hook.js.bak
// is not a match.
const KRSHNA_HOOK_SCRIPT = /[/\\]+scripts[/\\]+krshna-hook\.js$/;

// Split a shell-ish command into tokens, honouring single/double quotes.
function tokenizeCommand(command) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(command)) !== null) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

// A command hook is ours when it actually RUNS our script — marker or not. Parse it rather
// than substring-match: drop any leading VAR=value assignments (e.g. KRSHNA_HOOK=1), then
// require exactly two tokens — an interpreter named by path and the script — with the
// script ending in scripts/krshna-hook.js. This catches a legacy unmarked entry and an
// entry from another checkout, but rejects `echo …/krshna-hook.js`, `cat …/krshna-hook.js.bak`,
// and any bare mention. (Our own hooks always invoke node by absolute path, so requiring a
// path-shaped interpreter safely excludes `echo`/`cat`.) Fresh installs still write the marker.
function isKrshnaHook(hook) {
  if (hook?.type !== "command" || typeof hook.command !== "string") return false;
  const tokens = tokenizeCommand(hook.command);
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  if (tokens.length !== 2) return false;
  const [interpreter, script] = tokens;
  return /[/\\]/.test(interpreter) && KRSHNA_HOOK_SCRIPT.test(script);
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

// Read the file, apply the mutation to that fresh content, then tmp+rename via the shared
// store (src/store.js), rather than a second copy of the atomic-write dance. Reading
// immediately before the write keeps a concurrent change to the same file from being
// clobbered by stale in-memory content. `mutate` returns the value to write, or undefined
// to skip the write.
function updateJsonFile(filePath, fallback, mutate) {
  const next = mutate(readJsonFile(filePath, fallback));
  if (next === undefined) return false;
  return writeJson(filePath, next);
}

function installClaudeHook() {
  const settingsFile = claudeSettingsFile();
  const backupFile = `${settingsFile}.krshna-backup`;
  // Refresh the backup on every install so it tracks the user's current settings, but with
  // our own hook stripped, so a restore returns their file rather than one already carrying
  // our hook. A file that does not parse, or whose hooks are not in the shape Claude Code
  // expects, never replaces the last good backup: install is about to fail on it, and the
  // previous snapshot is then the only clean copy.
  if (fs.existsSync(settingsFile)) {
    const current = readJsonFile(settingsFile, null);
    const hooksValid = current && typeof current === "object"
      && (current.hooks === undefined || (current.hooks && typeof current.hooks === "object" && !Array.isArray(current.hooks)))
      && (current.hooks?.UserPromptSubmit === undefined || Array.isArray(current.hooks.UserPromptSubmit));
    if (!hooksValid) {
      // leave the existing backup alone
    } else if (Array.isArray(current.hooks?.UserPromptSubmit)) {
      const { result } = stripKrshnaHooks(current.hooks.UserPromptSubmit);
      const backup = { ...current, hooks: { ...current.hooks, UserPromptSubmit: result } };
      if (backup.hooks.UserPromptSubmit.length === 0) delete backup.hooks.UserPromptSubmit;
      if (Object.keys(backup.hooks).length === 0) delete backup.hooks;
      writeJson(backupFile, backup);
    } else {
      fs.copyFileSync(settingsFile, backupFile);
    }
  }

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
  let removed = false;
  updateJsonFile(claudeSettingsFile(), null, (settings) => {
    if (!settings || !Array.isArray(settings.hooks?.UserPromptSubmit)) return undefined;
    // Remove every marker match regardless of the Node or checkout path that wrote it.
    const { result, changed } = stripKrshnaHooks(settings.hooks.UserPromptSubmit);
    if (!changed) return undefined;
    removed = true;
    settings.hooks.UserPromptSubmit = result;
    if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    return settings;
  });
  return removed;
}

function install() {
  // Do the JSON step before touching .zshrc so a failure leaves the shell untouched.
  // A damaged ~/.claude/settings.json is moved aside with one line rather than
  // crashing with a stack trace or being silently overwritten with defaults.
  const settingsFile = claudeSettingsFile();
  const quarantined = [];
  readJsonQuarantine(settingsFile, {}, quarantined);
  if (quarantined.length > 0) {
    const { quarantinedTo } = quarantined[0];
    // quarantinedTo is null when the rename itself failed (e.g. a read-only ~/.claude):
    // branch on it rather than calling path.basename(null) and crashing with a TypeError.
    process.stderr.write(quarantinedTo
      ? `Krishna Companion moved a damaged ${path.basename(settingsFile)} aside (kept as ${path.basename(quarantinedTo)}); run \`krshna install\` again.\n`
      : `Krishna Companion could not move a damaged ${path.basename(settingsFile)} aside; left it untouched. Fix or remove it, then run \`krshna install\` again.\n`);
    process.exitCode = 1;
    return;
  }
  installClaudeHook();
  installZsh();
  console.log("Installed the /krshna shortcut, terminal status, and Claude Code voice hook.");
  console.log("Open a new terminal to use the shell integrations.");
}

function uninstall() {
  const removedHook = uninstallClaudeHook();
  const removedZsh = uninstallZsh();
  console.log(removedHook
    ? "Removed the Krishna Companion Claude Code voice hook."
    : "No Krishna Companion hook was present in Claude Code settings.");
  console.log(removedZsh
    ? "Removed the zsh integration block from ~/.zshrc."
    : "No zsh integration block was present in ~/.zshrc.");
  // Point the user at the snapshots install kept (taken before the most recent install,
  // with our own block or hook stripped), so they can restore by hand if they want.
  const backups = [`${claudeSettingsFile()}.krshna-backup`, `${zshrcFile()}.krshna-backup`].filter((file) => fs.existsSync(file));
  if (backups.length > 0) {
    console.log(`Snapshots from before the last install are at: ${backups.join(", ")} (left in place).`);
  }
}

function help() {
  console.log(`
Krishna Companion

  krshna             Make the companion live
  krshna start       Alias of krshna (make the companion live)
  krshna now         Invite a teaching now
  krshna pause       Pause scheduled teachings
  krshna resume      Resume the companion
  krshna status      Show its current state
  krshna context     Recall the last teaching and next verse
  krshna voice on    Enable hold-Space voice
  krshna voice off   Disable hold-Space voice
  krshna style <name>  Figure style: ${FIGURE_STYLES.join(" | ")}
  krshna stop        Stop the companion
  krshna install     Add /krshna, terminal status, and the Claude Code voice hook
  krshna uninstall   Remove the zsh integration and the Claude Code voice hook
`);
}

function main() {
  // `krshna style <name>`: the name must be one of FIGURE_STYLES (the app's own list);
  // a valid one is forwarded to the running companion like any other command.
  if (command.startsWith("style-") && command !== "style-") {
    const styleName = command.slice("style-".length);
    if (!FIGURE_STYLES.includes(styleName)) {
      console.error(`Unknown figure style: ${styleName}. Use: krshna style ${FIGURE_STYLES.join("|")}`);
      process.exitCode = 1;
      return;
    }
    if (!readState().live) {
      console.log("Kṛṣṇa Companion is not running. Start it with: krshna");
      return;
    }
    launch(command);
    return;
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
    case "now":
      // Launch or forward, then wait for the companion to stamp state.json before
      // returning, so the Claude Code hook knows the invocation was received.
      process.exitCode = runNow();
      break;
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
    case "style-":
      console.error(`Usage: krshna style ${FIGURE_STYLES.join("|")}`);
      process.exitCode = 1;
      break;
    default:
      console.error(`Unknown command: ${rawCommand}`);
      help();
      process.exitCode = 1;
  }
}

module.exports = { runNow, installZsh, uninstallZsh, isKrshnaHook, reportQuarantinedFiles, shQuote, claudeHookCommand };

// Run the CLI only when invoked directly, so tests can import the functions above
// without executing a command.
if (require.main === module) main();
