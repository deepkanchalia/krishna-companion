const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const cli = path.join(__dirname, "..", "bin", "krshna.js");

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
  assert.match(output, /krshna now/);
  assert.match(output, /krshna context/);
  assert.match(output, /krshna voice on/);
  assert.match(output, /krshna voice off/);
  assert.match(output, /Add \/krshna/);
});

test("context survives a malformed journey and reports unreadable entries", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-ctx-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dataDir = process.platform === "darwin"
    ? path.join(home, "Library", "Application Support", "krishna-companion")
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
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config") }
  });
  assert.match(output, /journey has 4 unreadable entries/);
  assert.match(output, /Last explained: Bhagavad-gītā As It Is 1\.1/);
  assert.match(output, /The readable one\./);
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
