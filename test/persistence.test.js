const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cli = path.join(__dirname, "..", "bin", "krshna.js");
const { runLive } = require("../bin/krshna.js");

// Mirror bin/krshna.js appDataDirectory() for the current platform, driven by KRSHNA_HOME.
function dataDirFor(home) {
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "krishna-companion");
  if (process.platform === "win32") return path.join(home, "AppData", "Roaming", "krishna-companion");
  return path.join(home, ".config", "krishna-companion");
}

function contextEnv(home) {
  return {
    ...process.env,
    HOME: home,
    KRSHNA_HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    APPDATA: path.join(home, "AppData", "Roaming")
  };
}

// Defect 2: `krshna live`/`start` must only claim the companion is live when launch()
// actually succeeded. A stubbed launcher stands in for the real launch, per CLAUDE.md
// (tests never start the Electron app).
test("runLive prints the live line only on a successful launch and reports failure otherwise", () => {
  const logs = [];
  const restore = console.log;
  console.log = (message) => logs.push(String(message));
  let failCode;
  let okCode;
  try {
    failCode = runLive("live", { launch: () => false });
    okCode = runLive("start", { launch: () => true });
  } finally {
    console.log = restore;
  }
  assert.equal(failCode, 1, "a failed launch returns a nonzero exit code");
  assert.equal(okCode, 0, "a successful launch returns 0");
  assert.equal(logs.filter((line) => /is live/.test(line)).length, 1, "the 'is live' line prints exactly once, only on the successful launch");
});

// Defect 1: when the shell step fails after the Claude hook write succeeded, the hook must
// be rolled back so the machine is left in the pre-install state, and install must exit
// non-zero rather than reporting success. The failure is injected by making ~/.zshrc a
// directory (so every write to it throws); the real ~/.zshrc and ~/.claude are never touched
// because HOME/KRSHNA_HOME point at a temp directory.
test("install rolls back the Claude hook and exits non-zero when the zsh step fails", {
  // A directory in place of ~/.zshrc makes writes to it fail on POSIX; root/Windows edge
  // cases are out of scope for this correctness batch.
  skip: process.platform === "win32" ? "the zshrc-as-directory failure injection is POSIX-only" : false
}, (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-install-rollback-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  const settingsFile = path.join(claudeDir, "settings.json");
  // A directory where ~/.zshrc should be: installZsh's first read throws, so the shell step
  // fails after the hook write has already landed.
  fs.mkdirSync(path.join(home, ".zshrc"));

  let error;
  try {
    execFileSync(process.execPath, [cli, "install"], { env: { ...process.env, HOME: home, KRSHNA_HOME: home }, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (thrown) {
    error = thrown;
  }
  assert.ok(error, "install exited non-zero");
  assert.equal(error.status, 1, "the exit code is 1");
  assert.match(error.stderr, /rolled back the Claude Code hook/, "the failure is reported clearly");
  assert.doesNotMatch(error.stdout || "", /Installed the \/krshna shortcut/, "no false success message");

  // The hook must be gone from settings.json: rollback stripped the entry it had written.
  const after = fs.readFileSync(settingsFile, "utf8");
  assert.doesNotMatch(after, /krshna-hook/, "the orphaned hook was rolled back, leaving the pre-install state");
});

// Persistence hardening: `krshna context` reads journey.json with a raw parse, so a
// parseable-but-wrong-shape file (literal null, an array, a scalar) must fail closed rather
// than crash on a property access.
test("krshna context survives a journey.json of the wrong shape without crashing", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-ctx-shape-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dataDir = dataDirFor(home);
  fs.mkdirSync(dataDir, { recursive: true });
  const journeyFile = path.join(dataDir, "journey.json");

  for (const bytes of ["null", "[]", "\"x\"", "42", "true"]) {
    fs.writeFileSync(journeyFile, bytes);
    let output;
    let error;
    try {
      output = execFileSync(process.execPath, [cli, "context"], { encoding: "utf8", env: contextEnv(home), stdio: ["pipe", "pipe", "pipe"] });
    } catch (thrown) {
      error = thrown;
    }
    assert.equal(error, undefined, `context exits 0 for journey ${bytes}`);
    assert.match(output, /No teaching has been shown yet/, `context reports "no teaching yet" for journey ${bytes}`);
    assert.doesNotMatch(output, /TypeError/, `no stack trace for journey ${bytes}`);
  }
});
