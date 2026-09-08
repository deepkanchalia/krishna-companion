const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const cli = path.join(projectRoot, "bin", "krshna.js");
const hook = path.join(projectRoot, "scripts", "krshna-hook.js");

// The hook spawns `<node> bin/krshna.js now`, which would start or poke the real
// companion. Tests point KRSHNA_HOOK_NODE at a stub that exits 0 instead, so a
// successful spawn is observed without launching anything (CLAUDE.md: tests never
// start the app). The stub is a POSIX script; on Windows the spawn fails and the
// hook fails open, which the platform notes already list as untested.
const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-hook-stub-"));
// The hook now waits for `krshna now` to *exit* and blocks only on exit 0. Two POSIX
// stubs stand in for that CLI without launching anything: one that acknowledges
// (exit 0) and one that reports no acknowledgement (exit 2). On Windows the spawn
// fails and the hook fails open, which the platform notes already list as untested.
const ackStub = path.join(stubDir, "ack-stub");
const noAckStub = path.join(stubDir, "no-ack-stub");
// A stub that ignores SIGTERM and sleeps well past the hook's 6 s budget, to prove
// the hook stops waiting on it rather than hanging the prompt.
const hangStub = path.join(stubDir, "hang-stub");
fs.writeFileSync(ackStub, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
fs.writeFileSync(noAckStub, "#!/bin/sh\nexit 2\n", { mode: 0o755 });
fs.writeFileSync(hangStub, "#!/bin/sh\ntrap '' TERM\nsleep 8\n", { mode: 0o755 });
test.after(() => fs.rmSync(stubDir, { recursive: true, force: true }));

function runHook(input, stub = ackStub, extraEnv = {}) {
  return execFileSync(process.execPath, [hook], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
    // PATH is emptied to prove the hook resolves the CLI by absolute path, not PATH.
    env: { ...process.env, PATH: "", KRSHNA_HOOK_NODE: stub, ...extraEnv }
  });
}

test("acknowledged invocation is blocked; non-matching prompts pass silently", {
  // The block path needs the POSIX stub to actually run as the CLI; Windows cannot
  // exec a /bin/sh script, so there the hook fails open (a documented platform gap).
  skip: process.platform === "win32" ? "POSIX stub cannot run on Windows" : false
}, () => {
  assert.equal(
    runHook(JSON.stringify({ prompt: "Hare Kṛṣṇa!" })),
    JSON.stringify({ decision: "block", reason: "Hare Kṛṣṇa" })
  );
  assert.equal(runHook(JSON.stringify({ prompt: "hare krishna please fix the bug" })), "");
  assert.equal(runHook("not json"), "");
});

test("a non-zero CLI exit fails open: empty stdout, exit 0", () => {
  assert.equal(runHook(JSON.stringify({ prompt: "Hare Kṛṣṇa!" }), noAckStub), "");
});

test("a spawn failure (missing launcher) fails open: empty stdout, exit 0", () => {
  const bogusNode = path.join(os.tmpdir(), "krshna-no-such-node-binary");
  assert.equal(runHook(JSON.stringify({ prompt: "Hare Kṛṣṇa!" }), bogusNode), "");
});

test("an oversized payload passes through untouched", () => {
  const huge = "Hare Kṛṣṇa " + "x".repeat(70 * 1024);
  assert.equal(runHook(JSON.stringify({ prompt: huge })), "");
});

test("a companion that never acknowledges is abandoned, not waited out", {
  // POSIX stub; on Windows the spawn fails and the hook fails open at once.
  skip: process.platform === "win32" ? "POSIX stub cannot run on Windows" : false
}, () => {
  const started = Date.now();
  // Restore PATH so the stub's `sleep` resolves; the hook itself still finds the CLI
  // by absolute path. Without this the stub would exit at once and never hang.
  const out = runHook(JSON.stringify({ prompt: "Hare Kṛṣṇa!" }), hangStub, { PATH: process.env.PATH });
  const elapsed = Date.now() - started;
  assert.equal(out, "", "no block decision: the prompt passes through");
  assert.ok(elapsed < 6500, `should give up near 6 s, not wait out the 8 s child (took ${elapsed} ms)`);
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
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

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
    fs.symlinkSync(path.join(projectRoot, "src"), path.join(root, "src"), "junction"); // junction: no privilege needed on Windows
    return path.join(root, "bin", "krshna.js");
  }

  const cliA = makeCheckout("checkout-a");
  const cliB = makeCheckout("checkout-b");

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-home2-"));
  context.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const settingsFile = path.join(home, ".claude", "settings.json");
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

  execFileSync(process.execPath, [cliA, "install"], { env });
  execFileSync(process.execPath, [cliB, "install"], { env });

  const installed = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  const commands = installed.hooks.UserPromptSubmit
    .flatMap((group) => group.hooks || [])
    .map((item) => item.command)
    .filter((command) => command.includes("KRSHNA_HOOK=1"));
  assert.equal(commands.length, 1);
  // Assert by segment, not a joined path: on Windows JSON.stringify escapes the path
  // separators inside the stored command, so an exact path.join() substring misses.
  assert.ok(commands[0].includes("checkout-b") && commands[0].includes("krshna-hook.js"));
  assert.ok(!commands[0].includes("checkout-a"));

  // Uninstall from the *other* checkout still removes it: marker, not path, matches.
  execFileSync(process.execPath, [cliA, "uninstall"], { env });
  const after = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  const remaining = (after.hooks?.UserPromptSubmit || [])
    .flatMap((group) => group.hooks || [])
    .filter((item) => typeof item.command === "string" && item.command.includes("KRSHNA_HOOK=1"));
  assert.equal(remaining.length, 0);
});

test("zsh block: two checkouts install one block; uninstall restores .zshrc byte-for-byte", (context) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-zsh-checkouts-"));
  context.after(() => fs.rmSync(workspace, { recursive: true, force: true }));

  function makeCheckout(name) {
    const root = path.join(workspace, name);
    fs.mkdirSync(path.join(root, "bin"), { recursive: true });
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(root, "shell"), { recursive: true });
    fs.copyFileSync(cli, path.join(root, "bin", "krshna.js"));
    fs.copyFileSync(hook, path.join(root, "scripts", "krshna-hook.js"));
    fs.writeFileSync(path.join(root, "shell", "krshna.zsh"), "# stub\n");
    fs.symlinkSync(path.join(projectRoot, "src"), path.join(root, "src"), "junction"); // junction: no privilege needed on Windows
    return path.join(root, "bin", "krshna.js");
  }

  const cliA = makeCheckout("checkout-a");
  const cliB = makeCheckout("checkout-b");

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-zsh-home-"));
  context.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const zshrc = path.join(home, ".zshrc");
  const before = "export EDITOR=vim\nalias ll='ls -la'\n";
  fs.writeFileSync(zshrc, before);
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

  execFileSync(process.execPath, [cliA, "install"], { env });
  execFileSync(process.execPath, [cliB, "install"], { env });

  const installed = fs.readFileSync(zshrc, "utf8");
  const blocks = installed.match(/# >>> krshna companion >>>/g) || [];
  assert.equal(blocks.length, 1, "exactly one zsh block");
  // Segment checks, not joined paths: Windows escapes the separators in the source
  // line (JSON.stringify), so an exact path.join() substring would miss.
  assert.ok(installed.includes("checkout-b") && installed.includes("krshna.zsh"), "points at the second checkout");
  assert.ok(!installed.includes("checkout-a"), "not the first checkout");
  assert.ok(installed.startsWith(before), "original lines preserved");

  execFileSync(process.execPath, [cliA, "uninstall"], { env });
  const restored = fs.readFileSync(zshrc, "utf8");
  assert.equal(restored, before, ".zshrc byte-identical after uninstall");

  // A second uninstall with no block present is a no-op.
  execFileSync(process.execPath, [cliA, "uninstall"], { env });
  assert.equal(fs.readFileSync(zshrc, "utf8"), before, "no-op uninstall leaves .zshrc unchanged");
});
