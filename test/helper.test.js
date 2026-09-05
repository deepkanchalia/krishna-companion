const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const helper = path.join(__dirname, "..", "helpers", "listen");
const canRunHelper = process.platform === "darwin" && fs.existsSync(helper);

test("voice helper starts or reports an unavailable permission/capability", {
  skip: canRunHelper ? false : "requires macOS and a built helper"
}, async () => {
  const child = spawn(helper, ["--timeout=1500"], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stdin.end();

  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  assert.ok([0, 2, 3, 4].includes(code), `unexpected exit code ${code}`);
  if (stdout.length > 0) {
    assert.ok(stdout.startsWith("READY\n"), `unexpected stdout: ${stdout}`);
  }
});
