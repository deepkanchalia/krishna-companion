const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const cli = path.join(__dirname, "..", "bin", "krshna.js");

test("CLI documents the universal terminal commands", () => {
  const output = execFileSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.match(output, /krshna\s+Make the companion live/);
  assert.match(output, /krshna now/);
  assert.match(output, /krshna context/);
  assert.match(output, /krshna voice on/);
  assert.match(output, /krshna voice off/);
  assert.match(output, /Add \/krshna/);
});

test("zsh prompt reads state without spawning Node", () => {
  const integration = fs.readFileSync(path.join(__dirname, "..", "shell", "krshna.zsh"), "utf8");
  assert.doesNotMatch(integration, /krshna prompt/);
  assert.match(integration, /state\.json/);
});

test("zsh prompt segment does not assign to read-only special parameters", (t) => {
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
