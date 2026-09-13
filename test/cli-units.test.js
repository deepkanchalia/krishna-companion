const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, help, main } = require("../src/cli/dispatch");
const { readState, timeUntil, printStatus } = require("../src/cli/context");

// Mirror src/paths.js appDataDirectory() for the current platform, driven by KRSHNA_HOME.
function dataDirFor(home) {
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "krishna-companion");
  if (process.platform === "win32") return path.join(home, "AppData", "Roaming", "krishna-companion");
  return path.join(home, ".config", "krishna-companion");
}

// Run `fn` with KRSHNA_HOME pointed at a fresh temp home and every console.log captured.
function withHome(t, fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-unit-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const savedHome = process.env.KRSHNA_HOME;
  // appDataDirectory() (src/paths.js) honours XDG_CONFIG_HOME on Linux and APPDATA on
  // Windows before falling back to $home/.config or $home/AppData/Roaming. CI runners set
  // XDG_CONFIG_HOME, which would send readState() outside this temp home and make dataDirFor
  // disagree with the code. Neutralise both so every path is deterministically under `home`.
  const savedXdg = process.env.XDG_CONFIG_HOME;
  const savedAppData = process.env.APPDATA;
  const savedExit = process.exitCode;
  const logs = [];
  const restore = console.log;
  console.log = (message) => logs.push(String(message));
  process.env.KRSHNA_HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.APPDATA;
  try {
    return fn(home, logs);
  } finally {
    console.log = restore;
    if (savedHome === undefined) delete process.env.KRSHNA_HOME;
    else process.env.KRSHNA_HOME = savedHome;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
    if (savedAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = savedAppData;
    process.exitCode = savedExit;
  }
}

function writeState(home, state) {
  const dataDir = dataDirFor(home);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "state.json"), JSON.stringify(state));
}

test("parseCommand folds voice/style subcommands and strips a leading slash", () => {
  assert.deepEqual(parseCommand(["node", "cli"]), { command: "live", rawCommand: "live" }, "no verb defaults to live");
  assert.deepEqual(parseCommand(["node", "cli", "STATUS"]), { command: "status", rawCommand: "status" }, "the verb is lowercased");
  assert.deepEqual(parseCommand(["node", "cli", "voice", "on"]), { command: "voice-on", rawCommand: "voice" });
  assert.deepEqual(parseCommand(["node", "cli", "voice"]), { command: "voice-", rawCommand: "voice" }, "a missing voice action leaves the usage sentinel");
  assert.deepEqual(parseCommand(["node", "cli", "style", "warrior"]), { command: "style-warrior", rawCommand: "style" });
  assert.deepEqual(parseCommand(["node", "cli", "/krshna"]), { command: "krshna", rawCommand: "/krshna" }, "a leading slash is stripped from the command");
});

test("timeUntil rounds up to whole minutes and floors at 'soon'/'<1m'", () => {
  assert.equal(timeUntil(undefined), "soon");
  assert.equal(timeUntil(0), "soon");
  assert.equal(timeUntil(Date.now() - 10_000), "<1m", "a past timestamp is under a minute");
  assert.equal(timeUntil(Date.now() + 90_000), "2m", "90s rounds up to 2m");
});

test("readState reports not-live for a missing, dead, or non-live state file", (t) => {
  withHome(t, (home) => {
    assert.deepEqual(readState(), { live: false }, "no state.json");
    writeState(home, { live: true, pid: 0x7ffffffe });
    assert.deepEqual(readState(), { live: false }, "a pid no process owns reads as not live");
    writeState(home, { live: false, pid: process.pid });
    assert.deepEqual(readState(), { live: false }, "live:false reads as not live");
  });
});

test("readState returns the state when the recorded pid is alive", (t) => {
  withHome(t, (home) => {
    writeState(home, { live: true, pid: process.pid, paused: false, intervalMinutes: 30 });
    const state = readState();
    assert.equal(state.live, true);
    assert.equal(state.pid, process.pid);
  });
});

test("printStatus prints the running, paused, and not-running lines", (t) => {
  withHome(t, (home, logs) => {
    printStatus();
    assert.match(logs.join("\n"), /not running/);

    logs.length = 0;
    writeState(home, { live: true, pid: process.pid, paused: true });
    printStatus();
    assert.match(logs.join("\n"), /is live \(PID/);
    assert.match(logs.join("\n"), /Teachings are paused/);

    logs.length = 0;
    writeState(home, { live: true, pid: process.pid, paused: false, intervalMinutes: 30, nextReflectionAt: Date.now() + 120000, nextReference: "Bhagavad-gītā As It Is 2.47" });
    printStatus();
    const out = logs.join("\n");
    assert.match(out, /Next teaching in .*cadence 30 minutes/);
    assert.match(out, /Next in sequence: Bhagavad-gītā As It Is 2\.47/);
  });
});

test("help lists the universal commands", (t) => {
  withHome(t, (_home, logs) => {
    help();
    const out = logs.join("\n");
    assert.match(out, /krshna now/);
    assert.match(out, /krshna style <name>/);
  });
});

test("main dispatches read-only verbs and validates without launching Electron", (t) => {
  withHome(t, (home, logs) => {
    const projectRoot = path.resolve(__dirname, "..");

    main({ argv: ["node", "cli", "status"], projectRoot });
    assert.match(logs.join("\n"), /not running/, "status routes to printStatus");

    logs.length = 0;
    main({ argv: ["node", "cli", "context"], projectRoot });
    assert.match(logs.join("\n"), /No teaching has been shown yet/, "context routes to printContext");

    // An unknown figure style is rejected before any launch attempt.
    process.exitCode = 0;
    main({ argv: ["node", "cli", "style", "nope"], projectRoot });
    assert.equal(process.exitCode, 1, "an unknown style exits 1");

    // A style command with no live app never spawns Electron.
    process.exitCode = 0;
    main({ argv: ["node", "cli", "style", "warrior"], projectRoot });
    assert.match(logs.join("\n"), /not running/);

    // voice with no action is a usage error.
    process.exitCode = 0;
    main({ argv: ["node", "cli", "voice"], projectRoot });
    assert.equal(process.exitCode, 1, "a bare voice command exits 1");

    // A live-only verb with no running app reports and does not launch.
    process.exitCode = 0;
    logs.length = 0;
    main({ argv: ["node", "cli", "pause"], projectRoot });
    assert.match(logs.join("\n"), /not running/);

    // An unknown command exits 1 and prints help.
    process.exitCode = 0;
    main({ argv: ["node", "cli", "flibber"], projectRoot });
    assert.equal(process.exitCode, 1, "an unknown command exits 1");
  });
});
