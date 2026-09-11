const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { createRequire } = require("node:module");
const { readConfig } = require("../src/config");
const { reflections, findVerseIndex } = require("../src/content");
const { createDarshan, ARRIVAL_MS, WITHDRAWAL_MS, UNTOUCHED_MS } = require("../src/darshan");

// Evaluate the actual main-process wiring against in-memory Electron doubles.
// No Electron import, real window, native permission or production data writes.
async function harness(argv = [], saved = null) {
  let now = 10_000;
  const timers = new Map();
  const writes = new Map();
  const windows = [];
  const ipc = new EventEmitter();
  const schedule = (fn, delay) => { const id = {}; timers.set(id, { fn, at: now + delay }); return id; };
  const cancel = (id) => timers.delete(id);
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].fn();
    }
    now = end;
  }
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.bounds = options; this.createOptions = options; this.visible = false; this.focused = false; this.dead = false;
      this.sent = []; this.webContents = new EventEmitter();
      this.webContents.send = (channel, payload) => this.sent.push({ channel, payload });
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    setBounds(value) { this.bounds = value; }
    getBounds() { return this.bounds; }
    getPosition() { return [this.bounds.x, this.bounds.y]; }
    getSize() { return [this.bounds.width, this.bounds.height]; }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setVibrancy() {}
    setFocusable(value) { this.focusable = value; if (!value) this.focused = false; }
    setIgnoreMouseEvents(value) { this.ignoresMouse = value; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    focus() { this.focused = true; }
    loadFile() {}
    isDestroyed() { return this.dead; }
  }
  const app = new EventEmitter();
  app.requestSingleInstanceLock = () => true;
  app.whenReady = () => Promise.resolve();
  app.getPath = () => "/in-memory";
  app.quit = () => {};
  const electron = {
    app, BrowserWindow: Window, ipcMain: ipc,
    Menu: { buildFromTemplate: (menu) => menu },
    Tray: class extends EventEmitter { setToolTip() {} setContextMenu() {} },
    Notification: { isSupported: () => false },
    globalShortcut: { register: () => true, unregisterAll() {} },
    nativeImage: { createFromPath: () => ({}) },
    screen: { getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1470, height: 956 } }), getCursorScreenPoint: () => ({ x: 1000, y: 500 }) },
    shell: { openExternal: (url) => writes.set("source", url) }
  };
  const mainFile = path.join(__dirname, "../src/main.js");
  const localRequire = createRequire(mainFile);
  const context = {
    __dirname: path.dirname(mainFile), console,
    process: { platform: "linux", pid: 42, on: () => {}, stderr: { write: () => {} } },
    Date: class extends Date { static now() { return now; } },
    setTimeout: schedule, clearTimeout: cancel,
    setInterval: () => ({}), clearInterval() {},
    require(name) {
      if (name === "electron") return electron;
      if (name === "./config") return { ...localRequire("./config"), readConfig: () => readConfig(argv) };
      if (name === "./darshan") return { createDarshan: (options) => createDarshan({ ...options, schedule, cancel }) };
      if (name === "./store") return {
        readJson(file, fallback) { return file.endsWith("journey.json") ? saved : fallback; },
        writeJson(file, value) { writes.set(path.basename(file), value); return true; }
      };
      return localRequire(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(mainFile, "utf8"), context);
  await Promise.resolve();
  windows[0].webContents.emit("did-finish-load");
  advance(450);
  return { app, windows, writes, advance, ipc,
    command: (command) => app.emit("second-instance", {}, [], "", readConfig([`--command=${command}`])),
    shows: () => windows.at(-1).sent.filter((entry) => entry.channel === "companion:show")
  };
}

test("first launch shows 1.1 without focus, next advances once, ending hides the window", async () => {
  const h = await harness();
  const win = h.windows[0];
  assert.equal(h.shows()[0].payload.reflection, reflections[0]);
  assert.equal(win.visible, true);
  assert.equal(win.focused, false);
  h.advance(ARRIVAL_MS);
  h.ipc.emit("companion:ready");
  h.ipc.emit("companion:next"); h.ipc.emit("companion:next");
  assert.equal(h.shows().length, 2);
  assert.equal(h.shows()[1].payload.reflection, reflections[1]);
  assert.equal(h.writes.get("journey.json").nextVerseIndex, 2);
  h.command("resume");
  assert.equal(win.visible, true, "resume cannot hide or reset an active encounter");
  h.ipc.emit("companion:dismiss");
  h.ipc.emit("companion:next");
  h.advance(WITHDRAWAL_MS);
  assert.equal(win.visible, false);
  assert.equal(h.shows().length, 2);
});

test("grouped verses advance to the next corpus entry and final verse wraps", async () => {
  for (const [request, expected] of [["1.16", "1.19"], ["18.78", "1.1"]]) {
    const index = findVerseIndex(reflections, request).index;
    const h = await harness(["--demo"], { nextVerseIndex: index, history: [] });
    h.ipc.emit("companion:ready"); h.ipc.emit("companion:next");
    assert.equal(h.shows().at(-1).payload.reflection.reference, `Bhagavad-gītā As It Is ${expected}`);
  }
});

test("specific verse previews cannot advance or alter the saved journey", async () => {
  const h = await harness(["--verse=2.47"]);
  h.ipc.emit("companion:ready"); h.ipc.emit("companion:next");
  assert.equal(h.shows().length, 1);
  assert.equal(h.shows()[0].payload.preview, true);
  assert.equal(h.writes.has("journey.json"), false);
});

test("expanded reading survives timeout; closing and recreating clears old timers", async () => {
  const h = await harness(["--demo", "--duration=2"]);
  h.ipc.emit("companion:expand");
  h.advance(ARRIVAL_MS + UNTOUCHED_MS);
  assert.equal(h.windows[0].visible, true);
  h.ipc.emit("companion:dismiss");
  h.windows[0].dead = true; h.windows[0].emit("closed");
  h.command("now");
  const fresh = h.windows.at(-1);
  fresh.webContents.emit("did-finish-load");
  h.advance(WITHDRAWAL_MS);
  assert.equal(fresh.visible, true, "withdrawal from old window cannot hide the new one");
});

test("a now on a not-yet-loaded window queues until the renderer is ready and advances once", async () => {
  const h = await harness([], { nextVerseIndex: 3, history: [{ reference: reflections[2].reference, explanation: reflections[2].meaning }] });
  // Recreate a window that has not finished loading: activate() builds it without a
  // did-finish-load, so the renderer is not yet ready to receive companion:show.
  h.windows[0].dead = true; h.windows[0].emit("closed");
  h.app.emit("activate");
  const fresh = h.windows.at(-1);
  h.command("now");
  assert.equal(fresh.sent.filter((e) => e.channel === "companion:show").length, 0, "nothing is sent before the renderer is ready");
  assert.equal(h.writes.has("journey.json"), false, "the journey does not advance before delivery");
  fresh.webContents.emit("did-finish-load");
  assert.equal(fresh.sent.filter((e) => e.channel === "companion:show").length, 1, "the queued show is sent exactly once");
  assert.equal(h.writes.get("journey.json").nextVerseIndex, 4, "the journey advances exactly once");
});

test("a now during withdrawal cancels the hide and re-arrives with the next verse", async () => {
  const h = await harness([], { nextVerseIndex: 3, history: [{ reference: reflections[2].reference, explanation: reflections[2].meaning }] });
  h.command("now");
  const win = h.windows.at(-1);
  h.advance(ARRIVAL_MS);
  h.ipc.emit("companion:dismiss");   // begin the withdrawal
  h.command("now");                  // interrupt within the withdrawal window
  h.advance(WITHDRAWAL_MS);
  assert.equal(win.visible, true, "the pending hide is cancelled and the darshan re-arrives");
  const shows = win.sent.filter((e) => e.channel === "companion:show");
  assert.equal(shows.at(-1).payload.reflection, reflections[4], "re-arrives with the next verse");
});

test("opening never takes focus; only an explicit engage focuses, and dismiss drops it", async () => {
  const h = await harness([], { nextVerseIndex: 3, history: [{ reference: reflections[2].reference, explanation: reflections[2].meaning }] });
  h.command("now");
  const win = h.windows.at(-1);
  assert.equal(win.createOptions.focusable, false, "the window is constructed non-focusable");
  assert.equal(win.focusable, false, "opens non-focusable");
  assert.equal(win.visible, true, "shown with showInactive()");
  assert.equal(win.focused, false, "opening does not steal focus");
  h.advance(ARRIVAL_MS);
  h.ipc.emit("companion:engage");
  assert.equal(win.focusable, true, "engage makes the window focusable");
  assert.equal(win.focused, true, "engage focuses the window");
  h.ipc.emit("companion:dismiss");
  assert.equal(win.focusable, false, "dismiss drops focusability");
  assert.equal(win.focused, false, "dismiss returns focus to the terminal");
});

test("returning users remain absent until invited and ordinary now never skips an open verse", async () => {
  const h = await harness([], { nextVerseIndex: 3, history: [{ reference: reflections[2].reference, explanation: reflections[2].meaning }] });
  assert.equal(h.windows[0].visible, false);
  h.command("now"); h.command("now");
  assert.equal(h.shows().length, 1);
  assert.equal(h.shows()[0].payload.reflection, reflections[3]);
  h.advance(ARRIVAL_MS + UNTOUCHED_MS + WITHDRAWAL_MS);
  assert.equal(h.windows[0].visible, false);
});

test("a style command persists the figure style and tells the renderer on the spot", async () => {
  const { FIGURE_STYLES, DEFAULT_FIGURE_STYLE } = require("../src/config");
  const h = await harness();
  h.command("now");
  assert.equal(h.shows().at(-1).payload.style, DEFAULT_FIGURE_STYLE, "the show payload carries the default style");
  h.command("style-cartoon");
  assert.equal(h.writes.get("settings.json").figure.style, "cartoon", "settings.json records the new style");
  const notice = h.windows.at(-1).sent.filter((entry) => entry.channel === "companion:style").at(-1);
  assert.equal(notice.payload, "cartoon", "the renderer is told the new style");
  h.command("style-nope");
  assert.equal(h.writes.get("settings.json").figure.style, "cartoon", "an unknown style changes nothing");
  // A darshan is already present, so the next show is an explicit Next verse.
  h.advance(ARRIVAL_MS);
  h.ipc.emit("companion:ready"); h.ipc.emit("companion:next");
  assert.equal(h.shows().at(-1).payload.style, "cartoon", "later shows carry the chosen style");
  assert.ok(FIGURE_STYLES.includes("cartoon"));
});
