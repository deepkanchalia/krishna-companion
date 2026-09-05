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
  const expectedCommand = `KRSHNA_HOOK=1 ${JSON.stringify(process.execPath)} ${JSON.stringify(hook)}`;
  assert.equal(commands.filter((item) => item === expectedCommand).length, 1);
  assert.ok(commands.includes("existing-hook"));
  assert.deepEqual(JSON.parse(fs.readFileSync(`${settingsFile}.krshna-backup`, "utf8")), original);

  execFileSync(process.execPath, [cli, "uninstall"], { env });
  const uninstalled = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.deepEqual(uninstalled.hooks.UserPromptSubmit, original.hooks.UserPromptSubmit);
});

test("installing from two checkout paths leaves exactly one hook; uninstall clears it", (context) => {
  // Build two lightweight checkouts that differ only by path: each has a real
  // copy of bin/krshna.js (so projectRoot differs) and a symlink to the shared
  // src/, which is all the install path needs.
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-checkouts-"));
  context.after(() => fs.rmSync(workspace, { recursive: true, force: true }));

  function makeCheckout(name) {
    const root = path.join(workspace, name);
    fs.mkdirSync(path.join(root, "bin"), { recursive: true });
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.copyFileSync(cli, path.join(root, "bin", "krshna.js"));
    fs.copyFileSync(hook, path.join(root, "scripts", "krshna-hook.js"));
    fs.symlinkSync(path.join(projectRoot, "src"), path.join(root, "src"));
    return path.join(root, "bin", "krshna.js");
  }

  const cliA = makeCheckout("checkout-a");
  const cliB = makeCheckout("checkout-b");

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-home2-"));
  context.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const settingsFile = path.join(home, ".claude", "settings.json");
  const env = { ...process.env, HOME: home };

  execFileSync(process.execPath, [cliA, "install"], { env });
  execFileSync(process.execPath, [cliB, "install"], { env });

  const installed = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  const commands = installed.hooks.UserPromptSubmit
    .flatMap((group) => group.hooks || [])
    .map((item) => item.command)
    .filter((command) => command.includes("KRSHNA_HOOK=1"));
  assert.equal(commands.length, 1);
  assert.ok(commands[0].includes(path.join("checkout-b", "scripts", "krshna-hook.js")));

  // Uninstall from the *other* checkout still removes it: marker, not path, matches.
  execFileSync(process.execPath, [cliA, "uninstall"], { env });
  const after = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  const remaining = (after.hooks?.UserPromptSubmit || [])
    .flatMap((group) => group.hooks || [])
    .filter((item) => typeof item.command === "string" && item.command.includes("KRSHNA_HOOK=1"));
  assert.equal(remaining.length, 0);
});
