"use strict";

// `krshna install` / `krshna uninstall`: add or remove the two shell integrations — the
// marked block in ~/.zshrc (the prompt segment) and the UserPromptSubmit entry in Claude
// Code's settings.json (the voice hook). Both are edited in place, backed up before an
// install, and matched by our own markers so a moved checkout or a second Node binary never
// leaves a duplicate. projectRoot is passed in (never derived here) so the paths point at the
// checkout that ran the CLI even when this module is reached through a symlinked src/.
const path = require("node:path");
const fs = require("node:fs");
const { readJson: readJsonQuarantine, writeJson } = require("../store");
const { homeDirectory } = require("../paths");

const ZSH_START = "# >>> krshna companion >>>";
const ZSH_END = "# <<< krshna companion <<<";

function zshrcFile() {
  return path.join(homeDirectory(), ".zshrc");
}

function zshBlock(projectRoot) {
  const sourcePath = path.join(projectRoot, "shell", "krshna.zsh");
  return `${ZSH_START}\nsource ${JSON.stringify(sourcePath)}\n${ZSH_END}`;
}

// Add or refresh the marked block in ~/.zshrc. Returns true on success and false if any
// filesystem step fails, so install() can roll the Claude hook back rather than reporting a
// success that never happened.
function installZsh(projectRoot) {
  try {
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
      fs.writeFileSync(zshrc, existing.slice(0, startIndex) + zshBlock(projectRoot) + existing.slice(after));
      return true;
    }
    // Always separate the block from prior content with exactly one newline (even when
    // the file already ends in one); uninstallZsh strips that same newline back, so a
    // file with or without a trailing newline round-trips byte-identical.
    const prefix = existing.length ? "\n" : "";
    fs.appendFileSync(zshrc, `${prefix}${zshBlock(projectRoot)}\n`);
    return true;
  } catch {
    return false;
  }
}

// Return the .zshrc content with our marked block removed, and the removed text (null when
// there is no block). Shared by uninstallZsh and by the install backup.
//
// The single separator newline install writes before the block is stripped ONLY when the
// block is the last thing in the file (as install always appends it). For a block that sits
// mid-file — a pre-B1 legacy block, or one a user moved — the newline before it belongs to
// the preceding line, so stripping it would merge two lines; there we leave it.
//
// One legacy case is inherently byte-ambiguous: a pre-B1 block appended after a
// newline-terminated file produces the same bytes as a B1 install onto a file with no
// trailing newline. Both look like "one separator newline before a block at EOF", so
// uninstall strips it — correct for B1, but it drops the pre-B1 file's final newline. This
// affects only that one shape and only the trailing newline; every other byte is preserved.
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

// Marker carried by every hook entry we install, so we can find (and replace or remove) our
// own entry regardless of which Node binary or checkout path produced it.
const CLAUDE_HOOK_MARKER = "KRSHNA_HOOK=1";

// POSIX single-quote a value so the shell that runs the hook takes it literally: single
// quotes protect everything except a single quote, which is closed, escaped as \', and
// reopened. JSON.stringify's double quotes would let the shell expand a $ or backtick.
function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function claudeHookCommand(projectRoot) {
  const hookPath = path.join(projectRoot, "scripts", "krshna-hook.js");
  return `${CLAUDE_HOOK_MARKER} ${shQuote(process.execPath)} ${shQuote(hookPath)}`;
}

// The script path a hook must end in to be ours (POSIX slash or Windows backslash, the
// latter doubled by JSON.stringify). Anchored so .../krshna-hook.js.bak is not a match.
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
// than substring-match: drop any leading VAR=value assignments, then require exactly two
// tokens — a path-shaped interpreter and the script ending in scripts/krshna-hook.js. This
// catches a legacy unmarked entry and one from another checkout, but rejects
// `echo …/krshna-hook.js` and `cat …/krshna-hook.js.bak`.
function isKrshnaHook(hook) {
  if (hook?.type !== "command" || typeof hook.command !== "string") return false;
  const tokens = tokenizeCommand(hook.command);
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  if (tokens.length !== 2) return false;
  const [interpreter, script] = tokens;
  return /[/\\]/.test(interpreter) && KRSHNA_HOOK_SCRIPT.test(script);
}

// Remove every marker-matching hook from a UserPromptSubmit list, dropping any group left
// empty. Returns the rewritten list and whether anything changed.
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
// store. Reading immediately before the write keeps a concurrent change from being clobbered
// by stale in-memory content. `mutate` returns the value to write, or undefined to skip.
function updateJsonFile(filePath, fallback, mutate) {
  const next = mutate(readJsonFile(filePath, fallback));
  if (next === undefined) return false;
  return writeJson(filePath, next);
}

function installClaudeHook(projectRoot) {
  const settingsFile = claudeSettingsFile();
  const backupFile = `${settingsFile}.krshna-backup`;
  // Refresh the backup on every install so it tracks the user's current settings, but with
  // our own hook stripped, so a restore returns their file. A file that does not parse, or
  // whose hooks are not in the shape Claude Code expects, never replaces the last good
  // backup: install is about to fail on it, and the previous snapshot is the only clean copy.
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

  // Return whether the hook write actually landed (writeJson returns false on failure) so
  // install() can tell success from a swallowed failure and roll back.
  return updateJsonFile(settingsFile, {}, (settings) => {
    settings.hooks ||= {};
    settings.hooks.UserPromptSubmit ||= [];
    // Replace any prior marker entry so we never accumulate duplicates, then append one.
    const { result } = stripKrshnaHooks(settings.hooks.UserPromptSubmit);
    result.push({
      matcher: "",
      hooks: [{ type: "command", command: claudeHookCommand(projectRoot) }]
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

function install(projectRoot) {
  // Do the JSON step before touching .zshrc so a failure leaves the shell untouched. A
  // damaged ~/.claude/settings.json is moved aside with one line rather than crashing.
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
  // Write the Claude Code hook first. If it fails, nothing else was touched, so there is
  // nothing to roll back: report and exit non-zero rather than claiming success.
  if (!installClaudeHook(projectRoot)) {
    process.stderr.write(`Krishna Companion could not write the Claude Code hook to ${path.basename(claudeSettingsFile())}; nothing was changed.\n`);
    process.exitCode = 1;
    return;
  }
  // If the shell step then fails, the hook is already installed. Roll it back so the machine
  // is left in the exact pre-install state instead of carrying an orphaned hook.
  if (!installZsh(projectRoot)) {
    uninstallClaudeHook();
    process.stderr.write("Krishna Companion could not update ~/.zshrc; rolled back the Claude Code hook. Nothing was changed.\n");
    process.exitCode = 1;
    return;
  }
  // Both steps truly succeeded: only now is it safe to claim success.
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
  // Point the user at the snapshots install kept (with our own block or hook stripped).
  const backups = [`${claudeSettingsFile()}.krshna-backup`, `${zshrcFile()}.krshna-backup`].filter((file) => fs.existsSync(file));
  if (backups.length > 0) {
    console.log(`Snapshots from before the last install are at: ${backups.join(", ")} (left in place).`);
  }
}

module.exports = {
  install,
  uninstall,
  installZsh,
  uninstallZsh,
  zshWithoutBlock,
  installClaudeHook,
  uninstallClaudeHook,
  isKrshnaHook,
  stripKrshnaHooks,
  tokenizeCommand,
  shQuote,
  claudeHookCommand,
  claudeSettingsFile,
  zshrcFile
};
