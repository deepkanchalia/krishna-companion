const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

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
