const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const cli = path.join(projectRoot, "bin", "krshna.js");
const hook = path.join(projectRoot, "scripts", "krshna-hook.js");

function runHook(input, extraEnv = {}) {
  return execFileSync(process.execPath, [hook], {
    input,
    encoding: "utf8",
    // PATH is emptied to prove the hook resolves the CLI by absolute path, not PATH.
    env: { ...process.env, PATH: "", ...extraEnv }
  });
}

test("matching prompts are blocked and non-matching prompts pass silently", () => {
  assert.equal(
    runHook(JSON.stringify({ prompt: "Hare Kṛṣṇa!" })),
    JSON.stringify({ decision: "block", reason: "Hare Kṛṣṇa" })
  );
  assert.equal(runHook(JSON.stringify({ prompt: "hare krishna please fix the bug" })), "");
  assert.equal(runHook("not json"), "");
});

test("a spawn failure fails open: empty stdout, exit 0", () => {
  const bogusNode = path.join(os.tmpdir(), "krshna-no-such-node-binary");
  const result = execFileSync(process.execPath, [hook], {
    input: JSON.stringify({ prompt: "Hare Kṛṣṇa!" }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, KRSHNA_HOOK_NODE: bogusNode }
  });
  assert.equal(result, "");
});

test("install merges the Claude hook idempotently and uninstall removes only it", (context) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-home-"));
  context.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const claudeDirectory = path.join(home, ".claude");
  const settingsFile = path.join(claudeDirectory, "settings.json");
  fs.mkdirSync(claudeDirectory, { recursive: true });
  const original = {
    theme: "dark",
    hooks: {
      UserPromptSubmit: [{
        matcher: "",
        hooks: [{ type: "command", command: "existing-hook" }]
      }]
    }
  };
  fs.writeFileSync(settingsFile, `${JSON.stringify(original, null, 2)}\n`);
  const env = { ...process.env, HOME: home };

  execFileSync(process.execPath, [cli, "install"], { env });
  execFileSync(process.execPath, [cli, "install"], { env });

  const installed = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  const commands = installed.hooks.UserPromptSubmit.flatMap((group) => group.hooks || []).map((item) => item.command);
  const expectedCommand = `${JSON.stringify(process.execPath)} ${JSON.stringify(hook)}`;
  assert.equal(commands.filter((item) => item === expectedCommand).length, 1);
  assert.ok(commands.includes("existing-hook"));
  assert.deepEqual(JSON.parse(fs.readFileSync(`${settingsFile}.krshna-backup`, "utf8")), original);

  execFileSync(process.execPath, [cli, "uninstall"], { env });
  const uninstalled = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.deepEqual(uninstalled.hooks.UserPromptSubmit, original.hooks.UserPromptSubmit);
});
