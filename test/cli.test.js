const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const cli = path.join(__dirname, "..", "bin", "krshna.js");
const { runNow } = require("../bin/krshna.js");

// Mirror bin/krshna.js appDataDirectory() for the current platform, driven by
// KRSHNA_HOME (which redirects the home root even on Windows, where os.homedir
// ignores HOME).
function dataDirFor(home) {
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "krishna-companion");
  if (process.platform === "win32") return path.join(home, "AppData", "Roaming", "krishna-companion");
  return path.join(home, ".config", "krishna-companion");
}

function zshAvailable() {
  try {
    execFileSync("zsh", ["-f", "-c", "true"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("CLI documents the universal terminal commands", () => {
  const output = execFileSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.match(output, /krshna\s+Make the companion live/);
  assert.match(output, /krshna start\s+Alias of krshna/);
  assert.match(output, /krshna now/);
  assert.match(output, /krshna context/);
  assert.doesNotMatch(output, /krshna prompt/);
  assert.match(output, /krshna voice on/);
  assert.match(output, /krshna voice off/);
  assert.match(output, /Add \/krshna/);
});

test("context survives a malformed journey and reports unreadable entries", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-ctx-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  // Mirror bin/krshna.js appDataDirectory() for each platform, driven by KRSHNA_HOME
  // (which redirects the home root even on Windows, where os.homedir ignores HOME).
  const appData = path.join(home, "AppData", "Roaming");
  const dataDir = process.platform === "darwin"
    ? path.join(home, "Library", "Application Support", "krishna-companion")
    : process.platform === "win32"
      ? path.join(appData, "krishna-companion")
      : path.join(home, ".config", "krishna-companion");
  fs.mkdirSync(dataDir, { recursive: true });
  const malformed = {
    nextVerseIndex: 3,
    history: [
      { reference: "Bhagavad-gītā As It Is 1.1", explanation: "The readable one.", translation: "t", source: "s", shownAt: "x" },
      null,
      { reference: 123, explanation: "non-string reference" },
      { reference: "Bhagavad-gītā As It Is 1.2" },
      "not an object"
    ]
  };
  fs.writeFileSync(path.join(dataDir, "journey.json"), JSON.stringify(malformed));

  const output = execFileSync(process.execPath, [cli, "context"], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      KRSHNA_HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      APPDATA: appData
    }
  });
  assert.match(output, /journey has 4 unreadable entries/);
  assert.match(output, /Last explained: Bhagavad-gītā As It Is 1\.1/);
  assert.match(output, /The readable one\./);
});

test("runNow returns 0 on acknowledgement, 2 on timeout, 1 on a missing launcher", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-runnow-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateFile = path.join(dir, "state.json");

  // Ack: the fake launcher stamps state.json exactly as the companion would.
  const ackLaunch = () => {
    fs.writeFileSync(stateFile, JSON.stringify({ lastCommand: { receivedAt: new Date().toISOString() } }));
    return true;
  };
  assert.equal(runNow({ launch: ackLaunch, stateFile, clock: () => 0, budgetMs: 2000 }), 0);

  // Timeout: launcher starts but nothing ever acknowledges; exactly one stderr line.
  const errors = [];
  const restore = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { errors.push(String(chunk)); return true; };
  let code;
  try {
    code = runNow({ launch: () => true, stateFile: path.join(dir, "absent.json"), clock: Date.now, budgetMs: 150 });
  } finally {
    process.stderr.write = restore;
  }
  assert.equal(code, 2);
  assert.equal(errors.length, 1, "one stderr line on timeout");
  assert.match(errors[0], /did not acknowledge/);

  // Missing launcher: exit 1.
  assert.equal(runNow({ launch: () => false, stateFile: path.join(dir, "x.json") }), 1);
});

test("install refuses a malformed settings.json: exit 1, one line, .zshrc untouched", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-install-bad-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "settings.json"), "{ not valid json");
  const zshrc = path.join(home, ".zshrc");
  const zshrcBefore = "export EDITOR=vim\n";
  fs.writeFileSync(zshrc, zshrcBefore);
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

  let error;
  try {
    execFileSync(process.execPath, [cli, "install"], { env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (thrown) {
    error = thrown;
  }
  assert.ok(error, "install exited non-zero");
  assert.equal(error.status, 1);
  const lines = error.stderr.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1, "exactly one stderr line");

  assert.equal(fs.readFileSync(zshrc, "utf8"), zshrcBefore, ".zshrc unchanged (JSON step runs first)");
  const kept = fs.readdirSync(claudeDir).filter((name) => /^settings\.corrupt-.*\.json$/.test(name));
  assert.equal(kept.length, 1, "the malformed settings file was moved aside, not deleted");
});

test("install does not crash when a corrupt settings.json cannot be moved aside", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-install-ro-"));
  t.after(() => { try { fs.chmodSync(path.join(home, ".claude"), 0o700); } catch { /* already */ } });
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "settings.json"), "{ not valid json");
  const zshrc = path.join(home, ".zshrc");
  const zshrcBefore = "export EDITOR=vim\n";
  fs.writeFileSync(zshrc, zshrcBefore);
  // Read-only directory: the quarantine rename fails, so quarantinedTo is null.
  fs.chmodSync(claudeDir, 0o500);
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

  let error;
  try {
    execFileSync(process.execPath, [cli, "install"], { env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (thrown) {
    error = thrown;
  }
  assert.ok(error, "install exited non-zero");
  assert.equal(error.status, 1);
  assert.doesNotMatch(error.stderr, /TypeError/, "no stack trace");
  assert.match(error.stderr, /could not move a damaged settings\.json aside; left it untouched/);
  assert.equal(fs.readFileSync(zshrc, "utf8"), zshrcBefore, ".zshrc untouched");
});

test("context reports a quarantined data file", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-ctx-corrupt-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dataDir = dataDirFor(home);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "settings.corrupt-2026-01-01T00-00-00-000Z-4242.json"), "{ was bad");

  const output = execFileSync(process.execPath, [cli, "context"], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      KRSHNA_HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      APPDATA: path.join(home, "AppData", "Roaming")
    }
  });
  assert.match(output, /damaged data file was kept aside/);
  assert.match(output, /settings\.corrupt-/);
});

test("context lists only real quarantine files, never a hostile filename", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-ctx-hostile-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dataDir = dataDirFor(home);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "state.corrupt-2026-01-01T00-00-00-000Z-4242.json"), "{ real");
  // Names that must never be echoed: wrong base, and a poisoned "stamp".
  fs.writeFileSync(path.join(dataDir, "evil.corrupt-2026Z.json"), "x");
  fs.writeFileSync(path.join(dataDir, "settings.corrupt-;rm -rf ~.json"), "x");

  const output = execFileSync(process.execPath, [cli, "context"], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      KRSHNA_HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      APPDATA: path.join(home, "AppData", "Roaming")
    }
  });
  assert.match(output, /state\.corrupt-2026-01-01T00-00-00-000Z-4242\.json/, "the real file is listed");
  assert.doesNotMatch(output, /evil/, "wrong-base file excluded");
  assert.doesNotMatch(output, /rm -rf/, "poisoned name excluded");
});

test("zsh prompt reads state without spawning Node", () => {
  const integration = fs.readFileSync(path.join(__dirname, "..", "shell", "krshna.zsh"), "utf8");
  assert.doesNotMatch(integration, /krshna prompt/);
  assert.match(integration, /state\.json/);
});

test("zsh prompt segment does not assign to read-only special parameters", {
  skip: zshAvailable() ? false : "requires zsh on PATH"
}, (t) => {
  const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-zsh-"));
  t.after(() => fs.rmSync(temporaryHome, { recursive: true, force: true }));

  const stateDirectory = process.platform === "darwin"
    ? path.join(temporaryHome, "Library", "Application Support", "krishna-companion")
    : path.join(temporaryHome, "krishna-companion");
  fs.mkdirSync(stateDirectory, { recursive: true });
  fs.writeFileSync(path.join(stateDirectory, "state.json"), JSON.stringify({
    live: true,
    pid: process.pid,
    paused: true
  }, null, 2));

  const integration = path.join(__dirname, "..", "shell", "krshna.zsh");
  const output = execFileSync("zsh", [
    "-f",
    "-c",
    'source "$1"; _krshna_prompt_segment',
    "zsh",
    integration
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: temporaryHome,
      XDG_CONFIG_HOME: temporaryHome
    }
  });

  assert.equal(output, "%F{yellow}🪶 Kṛṣṇa · paused%f");
});
