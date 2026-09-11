const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createVoiceRuntime } = require("../src/voice-runtime");
const { containsInvocation } = require("../src/voice");

// A stand-in for the spawned helper: an emitter with a line-oriented stdout and a kill()
// flag, so the transcript hand-off can be driven without a real helper process.
class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
    this.stdout = new EventEmitter();
    this.stdout.setEncoding = () => {};
  }
  kill() { this.killed = true; }
}

function runtimeHarness({ expanded = false } = {}) {
  const children = [];
  const setListeningCalls = [];
  let matches = 0;
  const runtime = createVoiceRuntime({
    platform: "darwin",
    spawn: () => { const child = new FakeChild(); children.push(child); return child; },
    systemPreferences: { isTrustedAccessibilityClient: () => true },
    existsSync: () => true,
    helperPath: "/fake/helper",
    helperBuildPath: "/fake/build.sh",
    projectRoot: "/fake",
    listenTimeoutMs: 6000,
    loadHook: () => { throw new Error("not used in this test"); },
    observeHold: () => ({ stop() {} }),
    createFrontmostAppGate: () => () => true,
    containsInvocation,
    getVoiceSettings: () => ({ enabled: true, key: "Space", holdMs: 2000 }),
    isExpanded: () => expanded,
    setListening: (active) => setListeningCalls.push(active),
    notify: () => {},
    onMatch: () => { matches += 1; },
    logError: () => {}
  });
  return { runtime, children, setListeningCalls, matchCount: () => matches };
}

test("a recognised invocation in the transcript triggers exactly one match and ends the session", () => {
  const h = runtimeHarness();
  assert.equal(h.runtime.startListening(), true, "listening starts");
  assert.deepEqual(h.setListeningCalls, [true], "listening feedback turned on");
  const child = h.children[0];

  child.stdout.emit("data", "just some noise\n");
  assert.equal(h.matchCount(), 0, "a non-invocation line does not match");

  child.stdout.emit("data", "Hare Kṛṣṇa\n");
  assert.equal(h.matchCount(), 1, "the invocation triggers onMatch");
  assert.equal(child.killed, true, "the helper is stopped once the invocation is heard");
  assert.deepEqual(h.setListeningCalls, [true, false], "listening feedback turned off");

  // The session is over: a further line cannot trigger a second darshan.
  child.stdout.emit("data", "Hare Kṛṣṇa\n");
  assert.equal(h.matchCount(), 1, "no second match after the session ended");
});

test("startListening refuses while a darshan is already expanded", () => {
  const h = runtimeHarness({ expanded: true });
  assert.equal(h.runtime.startListening(), false, "no listen behind an open teaching");
  assert.equal(h.children.length, 0, "no helper spawned");
});

test("a chunk split across the newline still matches once the line completes", () => {
  const h = runtimeHarness();
  h.runtime.startListening();
  const child = h.children[0];
  child.stdout.emit("data", "Hare ");
  assert.equal(h.matchCount(), 0, "an incomplete line does not match");
  child.stdout.emit("data", "Kṛṣṇa\n");
  assert.equal(h.matchCount(), 1, "the completed line matches");
});
