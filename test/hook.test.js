const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
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
// the hook stops waiting on it AND SIGKILLs it rather than orphaning it. It records
// its own PID so the test can confirm the process is gone.
const hangStub = path.join(stubDir, "hang-stub");
fs.writeFileSync(ackStub, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
fs.writeFileSync(noAckStub, "#!/bin/sh\nexit 2\n", { mode: 0o755 });
fs.writeFileSync(hangStub, '#!/bin/sh\ntrap "" TERM\necho $$ > "$KRSHNA_STUB_PIDFILE"\nsleep 8\n', { mode: 0o755 });

// Poll until `pid` no longer exists (signal 0 throws), or the budget elapses.
function processGoneWithin(pid, budgetMs) {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true; // ESRCH: the process is gone.
    }
    if (Date.now() >= deadline) return false;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}
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

test("an oversized payload exits at once without waiting for EOF", () => {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook], {
      env: { ...process.env, PATH: "", KRSHNA_HOOK_NODE: ackStub }
    });
    let out = "";
    const started = Date.now();
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stdin.on("error", () => {}); // stdin is destroyed once the cap is hit
    child.on("error", reject);
    child.on("exit", (code) => {
      const elapsed = Date.now() - started;
      try {
        assert.equal(code, 0, "passes through with exit 0");
        assert.equal(out, "", "nothing on stdout");
        assert.ok(elapsed < 1000, `should stop reading at the cap, not hang (took ${elapsed} ms)`);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    // Send more than the 64 KB cap and deliberately never end stdin.
    child.stdin.write("Hare Kṛṣṇa " + "x".repeat(70 * 1024));
  });
});

test("a companion that never acknowledges is abandoned, not waited out", {
  // POSIX stub; on Windows the spawn fails and the hook fails open at once.
  skip: process.platform === "win32" ? "POSIX stub cannot run on Windows" : false
}, () => {
  const pidFile = path.join(stubDir, "hang-pid");
  fs.rmSync(pidFile, { force: true });
  const started = Date.now();
  // Restore PATH so the stub's `sleep` resolves; the hook itself still finds the CLI
  // by absolute path. Without this the stub would exit at once and never hang.
  const out = runHook(JSON.stringify({ prompt: "Hare Kṛṣṇa!" }), hangStub, {
    PATH: process.env.PATH,
    KRSHNA_STUB_PIDFILE: pidFile
  });
  const elapsed = Date.now() - started;
  assert.equal(out, "", "no block decision: the prompt passes through");
  // Real budget: 6.0 s ack timeout + 0.5 s SIGTERM->SIGKILL escalation + spawn overhead,
  // so it settles well under the 8 s child. 6600 ms leaves headroom for the spawn cost.
  assert.ok(elapsed < 6600, `should give up near 6.5 s, not wait out the 8 s child (took ${elapsed} ms)`);

  // The child must be SIGKILLed, not orphaned: its PID is gone within 1 s.
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  assert.ok(Number.isInteger(pid) && pid > 0, "stub recorded its PID");
  assert.ok(processGoneWithin(pid, 1000), `the stub process ${pid} was killed, not orphaned`);
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

test("install replaces a legacy unmarked hook entry; uninstall removes it", (context) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-legacy-hook-"));
  context.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const settingsFile = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  // A hook installed before the KRSHNA_HOOK=1 marker existed: it still names
  // krshna-hook.js but carries no marker and a stale checkout path.
  const legacyCommand = `/usr/bin/node /old/checkout/scripts/krshna-hook.js`;
  fs.writeFileSync(settingsFile, `${JSON.stringify({
    hooks: { UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: legacyCommand }] }] }
  }, null, 2)}\n`);
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

  execFileSync(process.execPath, [cli, "install"], { env });
  const installed = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  const ours = installed.hooks.UserPromptSubmit
    .flatMap((group) => group.hooks || [])
    .filter((item) => typeof item.command === "string" && item.command.includes("krshna-hook.js"));
  assert.equal(ours.length, 1, "the legacy entry was replaced, not left to accumulate a second one");
  assert.ok(ours[0].command.includes("KRSHNA_HOOK=1"), "the fresh entry carries the marker");
  assert.ok(!ours[0].command.includes("/old/checkout"), "the stale legacy path is gone");

  execFileSync(process.execPath, [cli, "uninstall"], { env });
  const after = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  const remaining = (after.hooks?.UserPromptSubmit || [])
    .flatMap((group) => group.hooks || [])
    .filter((item) => typeof item.command === "string" && item.command.includes("krshna-hook.js"));
  assert.equal(remaining.length, 0, "uninstall removes the legacy-derived entry too");
});

test("a foreign hook that only mentions krshna-hook.js in text is left untouched", (context) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-foreign-hook-"));
  context.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const settingsFile = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  const foreign = "echo krshna-hook.js is nice";
  fs.writeFileSync(settingsFile, `${JSON.stringify({
    hooks: { UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: foreign }] }] }
  }, null, 2)}\n`);
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

  execFileSync(process.execPath, [cli, "install"], { env });
  let commands = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
    .hooks.UserPromptSubmit.flatMap((group) => group.hooks || []).map((item) => item.command);
  assert.ok(commands.includes(foreign), "the foreign hook survives install");
  assert.equal(commands.filter((c) => /[/\\]+scripts[/\\]+krshna-hook\.js/.test(c)).length, 1, "ours added once");

  execFileSync(process.execPath, [cli, "uninstall"], { env });
  commands = ((JSON.parse(fs.readFileSync(settingsFile, "utf8")).hooks || {}).UserPromptSubmit || [])
    .flatMap((group) => group.hooks || []).map((item) => item.command);
  assert.ok(commands.includes(foreign), "the foreign hook survives uninstall too");
});

test("a .js.bak lookalike hook is foreign; the real shapes are still ours", (context) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-bak-hook-"));
  context.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const settingsFile = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  const bak = "cat /tmp/scripts/krshna-hook.js.bak";
  fs.writeFileSync(settingsFile, `${JSON.stringify({
    hooks: { UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: bak }] }] }
  }, null, 2)}\n`);
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

  execFileSync(process.execPath, [cli, "install"], { env });
  const installed = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
    .hooks.UserPromptSubmit.flatMap((group) => group.hooks || []).map((item) => item.command);
  assert.ok(installed.includes(bak), "the .js.bak hook is left alone");
  // Real shapes still recognised as ours by the end-anchored path.
  const ours = installed.filter((c) => /[/\\]+scripts[/\\]+krshna-hook\.js(?=["'\s]|$)/.test(c));
  assert.equal(ours.length, 1);
  assert.ok(ours[0].includes("KRSHNA_HOOK=1"));

  execFileSync(process.execPath, [cli, "uninstall"], { env });
  const after = ((JSON.parse(fs.readFileSync(settingsFile, "utf8")).hooks || {}).UserPromptSubmit || [])
    .flatMap((group) => group.hooks || []).map((item) => item.command);
  assert.ok(after.includes(bak), "the .js.bak hook survives uninstall too");
});

test("isKrshnaHook parses the command: our shapes accepted, echo/.bak lookalikes rejected", () => {
  const { isKrshnaHook } = require("../bin/krshna.js");
  const cmd = (command) => isKrshnaHook({ type: "command", command });
  // Our three real shapes (marked, legacy unmarked, another checkout) — all node-by-path.
  assert.equal(cmd(`KRSHNA_HOOK=1 "/usr/local/bin/node" "/co/scripts/krshna-hook.js"`), true);
  assert.equal(cmd(`/usr/bin/node /old/checkout/scripts/krshna-hook.js`), true);
  assert.equal(cmd(`KRSHNA_HOOK=1 "/opt/n/bin/node" "/other-checkout/scripts/krshna-hook.js"`), true);
  // Foreign: a lookalike interpreter, a .bak sibling, and an extra-token mention.
  assert.equal(cmd(`echo /opt/scripts/krshna-hook.js`), false, "echo is not a path-shaped interpreter");
  assert.equal(cmd(`cat /tmp/scripts/krshna-hook.js.bak`), false, ".bak sibling is not our script");
  assert.equal(cmd(`/usr/bin/node /co/scripts/krshna-hook.js --extra`), false, "three tokens is not our shape");
});

test("a legacy zsh block (no separator newline) is replaced, not duplicated, and uninstalled cleanly", (context) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-legacy-zsh-"));
  context.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const zshrc = path.join(home, ".zshrc");
  // Pre-B1 shape: the marked block sits directly after prior content with no separator
  // line, with more user content after it.
  const before = "export EDITOR=vim\n";
  const after = "alias ll='ls -la'\n";
  const legacyBlock = '# >>> krshna companion >>>\nsource "/old/path/shell/krshna.zsh"\n# <<< krshna companion <<<';
  fs.writeFileSync(zshrc, `${before}${legacyBlock}\n${after}`);
  const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

  execFileSync(process.execPath, [cli, "install"], { env });
  const installed = fs.readFileSync(zshrc, "utf8");
  assert.equal((installed.match(/# >>> krshna companion >>>/g) || []).length, 1, "one block, not duplicated");
  assert.ok(!installed.includes("/old/path"), "the legacy source path was replaced in place");
  assert.ok(installed.startsWith(before), "content before the block is preserved");
  assert.ok(installed.endsWith(after), "content after the block is preserved");

  execFileSync(process.execPath, [cli, "uninstall"], { env });
  assert.equal(fs.readFileSync(zshrc, "utf8"), before + after, "surrounding lines byte-identical, not merged");
});

test("zsh install/uninstall round-trips both trailing-newline shapes byte-for-byte", (context) => {
  for (const before of ["export EDITOR=vim\nalias ll='ls -la'\n", "export EDITOR=vim\nalias ll='ls -la'"]) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-zsh-shape-"));
    context.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const zshrc = path.join(home, ".zshrc");
    fs.writeFileSync(zshrc, before);
    const env = { ...process.env, HOME: home, KRSHNA_HOME: home };

    execFileSync(process.execPath, [cli, "install"], { env });
    const installed = fs.readFileSync(zshrc, "utf8");
    assert.ok(installed.startsWith(before), "prior content is preserved");
    assert.ok(installed.includes("# >>> krshna companion >>>"), "the block was written");

    execFileSync(process.execPath, [cli, "uninstall"], { env });
    const shape = before.endsWith("\n") ? "trailing newline" : "no trailing newline";
    assert.equal(fs.readFileSync(zshrc, "utf8"), before, `${shape}: byte-identical after uninstall`);
  }
});
