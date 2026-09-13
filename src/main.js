const path = require("node:path");
const { existsSync } = require("node:fs");
const { writeFile, mkdir } = require("node:fs/promises");
const { spawn } = require("node:child_process");
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  systemPreferences
} = require("electron");
const {
  readConfig,
  FIGURE_STYLES,
  normalizeFigureStyle
} = require("./config");
const { reflections, findVerseIndex } = require("./content");
const { readJson, writeJson } = require("./store");
const { normalizeJourney, recordTeaching } = require("./journey");
const { canShowTeaching } = require("./schedule");
const { reconcileCadence } = require("./cadence");
const { containsInvocation } = require("./voice");
const { windowCanAcknowledge } = require("./ack");
const { planSecondInstance } = require("./second-instance");
const { shortcutUnavailableMessage } = require("./shortcut");
const { safeLabel, isPlainObject } = require("./sanitize");
const {
  normalizeSettings,
  validRestingPosition,
  boundedInterval,
  safeVerseIndex,
  isTrueFlag
} = require("./schema");
const {
  createDarshan,
  ARRIVAL_MS,
  WITHDRAWAL_MS,
  BREATH_MS,
  SETTLE_MS,
  SETTLE_PX
} = require("./darshan");
const {
  DEFAULT_VOICE_SETTINGS,
  createFrontmostAppGate,
  observeHold
} = require("./voice-hold");
const { createVoiceRuntime } = require("./voice-runtime");
const { buildTrayMenuTemplate } = require("./tray");
const { createWindowGeometry } = require("./window-geometry");

// Exactly 10% smaller than the previous 176 × 224 resting widget.
const RESTING_SIZE = { width: 158, height: 202 };
// Reading height is a floor: the renderer reports how tall the verbatim text needs the card to be.
// READING_SIZE.width is the single source for the expanded reading width. The compact CSS layout
// (styles.css @media max-width) is the fallback for displays too narrow to hold this width.
const READING_SIZE = { width: 660, height: 380 };
const SCREEN_MARGIN = 8;
// Every darshan timing comes from src/darshan.js. The renderer turns these into the
// --arrival/--withdraw/--breath/--settle/--settle-px CSS custom properties.
const MOTION_TIMINGS = {
  arrivalMs: ARRIVAL_MS,
  withdrawalMs: WITHDRAWAL_MS,
  breathMs: BREATH_MS,
  settleMs: SETTLE_MS,
  settlePx: SETTLE_PX
};
// ⌘⌥K / Ctrl+Alt+K: ⌘⇧K is "Delete Line" in VS Code and would be stolen from every editor.
const SHORTCUT = "CommandOrControl+Alt+K";
const LISTEN_TIMEOUT_MS = 6_000;
// How long a programmatic setBounds keeps the "moved" listener from mistaking our own
// move for a user drag: long enough for the native move event to arrive and be ignored.
const PROGRAMMATIC_MOVE_RESET_MS = 100;
// Delay after the renderer's first load before the launch command runs, so the resting
// figure is painted and placed before an arrival can begin.
const BOOT_DELAY_MS = 450;
// Delay before capturing the preview screenshot, so arrival/idle frames have decoded and
// the figure is drawn rather than a blank card.
const SCREENSHOT_DELAY_MS = 2_600;
// The command prefix `style-<name>` carries a figure style; the name is everything after it.
const STYLE_COMMAND_PREFIX = "style-";
const projectRoot = path.join(__dirname, "..");
const helperPath = path.join(projectRoot, "helpers", "listen");
const helperBuildPath = path.join(projectRoot, "scripts", "build-helper.sh");
const config = readConfig();
let readingHeight = READING_SIZE.height;

let companionWindow;
let tray;
let cadenceTimer;
let paused = false;
let nextReflectionAt;
let lastCommand = null;
let nextVerseIndex = 0;
let requestedVerseIndex;
let statePath;
let journeyPath;
let settingsPath;
let journey = { version: 1, nextVerseIndex: 0, history: [] };
let settings = { version: 1, voice: { ...DEFAULT_VOICE_SETTINGS } };
let restingPosition;
let isExpanded = false;
let programmaticMove = false;
let voiceNoticeShown = false;
let previewEncounter = false;
let encounterDuration = 0;
let readyForNext = false;
// True once the current window's renderer has finished loading (did-finish-load), so
// a companion:show it receives is not lost. Reset when the window is (re)created.
let rendererReady = false;
const darshan = createDarshan({
  onWithdraw: () => {
    if (!companionWindow || companionWindow.isDestroyed()) return;
    companionWindow.webContents.send("companion:collapse");
    // Hand focus back immediately; the exit animation is not an input surface.
    companionWindow.setFocusable(false);
    companionWindow.setIgnoreMouseEvents(true);
  },
  onAbsent: showRestingCompanion
});

// The full parsed config travels to a running instance so it can honour a verse,
// interval, duration, demo or screenshot passed to a second launch (planSecondInstance).
const instanceLock = app.requestSingleInstanceLock(config);
if (!instanceLock) app.quit();

// A stray rejection or thrown error writes one sanitised line to stderr (safeLabel strips
// control bytes and caps length so an error message built from untrusted text cannot
// inject a newline or escape sequence). Before startup has finished (no tray yet) the
// process exits non-zero: registering these handlers suppresses Electron's own error
// dialog, and a swallowed startup failure would leave an invisible process with no tray,
// no window and a CLI that keeps reporting "not running". Once the tray exists the
// companion stays alive; crashing then would take the whole loop down.
function reportStrayError(kind, error) {
  process.stderr.write(`Krishna Companion ${kind}: ${safeLabel(error?.message || error, 200)}\n`);
  if (!tray) app.exit(1);
}
process.on("unhandledRejection", (reason) => reportStrayError("unhandled rejection", reason));
process.on("uncaughtException", (error) => reportStrayError("uncaught exception", error));

// Files that were found corrupt and moved aside during this launch. Turned into one
// startup notification so the reader learns their originals were kept, not lost.
const quarantined = [];

function readPersistentData() {
  const oldState = readJson(statePath, {}, quarantined);
  const savedJourney = readJson(journeyPath, null, quarantined);
  const savedSettings = readJson(settingsPath, {}, quarantined);

  // Fail closed on every persisted read: a wrong-shape file (null, array, scalar from a hand
  // edit or a truncated write) is treated as absent. store.readJson already coerces these,
  // but the guard is repeated so main.js cannot be crashed by any injected readJson variant.
  // Each field is validated by src/schema.js (allow-list / range / finite), since
  // settings.json and state.json are untrusted input (C3, C7).
  const safeState = isPlainObject(oldState) ? oldState : {};
  settings = normalizeSettings(savedSettings);

  journey = normalizeJourney(savedJourney, reflections.length, safeVerseIndex(safeState.nextVerseIndex));
  nextVerseIndex = journey.nextVerseIndex;
  paused = isTrueFlag(safeState.paused);

  // The cadence interval is changeable at runtime (tray "Every" submenu and a
  // second-instance --interval), so it persists across restarts. An explicit --interval on
  // this launch wins; otherwise restore the saved value, failing closed to the default.
  if (!config.provided?.interval) {
    config.intervalMinutes = boundedInterval(safeState.intervalMinutes, config.intervalMinutes);
  }

  if (config.provided?.verse) {
    // --verse=1.32-35 previews one specific teaching without touching the saved journey.
    // A verse that is missing/empty/nonexistent is a hard error on a direct launch: exit
    // rather than silently falling back to saved progress and showing the wrong teaching.
    if (!config.verse || !String(config.verse).trim()) {
      // An empty "--verse=" is a usage slip, not a bad verse number: say what to pass.
      console.error("Krishna Companion: --verse needs a value like 2.47");
      app.exit(1);
      return;
    }
    const result = findVerseIndex(reflections, config.verse);
    if (result.error) {
      console.error(`Krishna Companion: ${result.error}`);
      app.exit(1);
      return;
    }
    requestedVerseIndex = result.index;
  }
  const savedRestingPosition = validRestingPosition(savedSettings);
  if (savedRestingPosition) restingPosition = savedRestingPosition;
  saveSettings();
}

function saveState(live = true) {
  if (!statePath) return;
  const last = journey.history.at(-1);
  writeJson(statePath, {
    live,
    pid: process.pid,
    paused,
    intervalMinutes: config.intervalMinutes,
    durationSeconds: config.durationSeconds,
    nextReflectionAt,
    nextVerseIndex,
    nextReference: reflections[nextVerseIndex]?.reference,
    lastReference: last?.reference,
    lastCommand
  });
}

// Record that a `now` invocation reached this instance, and persist it before the
// card is shown. The CLI polls state.json for this stamp: the acknowledgement must
// not depend on a card actually opening, since one may already be open.
function acknowledgeCommand(name) {
  lastCommand = { name, receivedAt: new Date().toISOString() };
  saveState();
}

function saveJourney(index, reflection) {
  journey = recordTeaching(journey, index, reflection, new Date().toISOString(), reflections.length);
  nextVerseIndex = journey.nextVerseIndex;
  writeJson(journeyPath, journey);
  saveState();
}

function saveSettings() {
  if (!settingsPath) return;
  settings = {
    ...settings,
    version: 1,
    voice: { ...settings.voice },
    figure: { style: normalizeFigureStyle(settings.figure?.style) }
  };
  if (restingPosition) settings.restingPosition = restingPosition;
  writeJson(settingsPath, settings);
}

// Window placement lives in window-geometry.js. It re-clamps the resting position each
// time and hands it back so this file can remember it; computeBounds carries that memory.
const geometry = createWindowGeometry({
  screen,
  restingSize: RESTING_SIZE,
  readingSize: READING_SIZE,
  screenMargin: SCREEN_MARGIN
});

function computeBounds(expanded) {
  const result = geometry.widgetBounds({ expanded, restingPosition, readingHeight });
  restingPosition = result.restingPosition;
  return result.bounds;
}

function setWidgetBounds(expanded) {
  programmaticMove = true;
  companionWindow.setBounds(computeBounds(expanded), false);
  setTimeout(() => { programmaticMove = false; }, PROGRAMMATIC_MOVE_RESET_MS);
}

function setGlass(active) {
  if (process.platform === "darwin") {
    companionWindow.setVibrancy(active ? "under-window" : null);
  }
  if (process.platform === "win32" && companionWindow.setBackgroundMaterial) {
    companionWindow.setBackgroundMaterial(active ? "acrylic" : "none");
  }
}

function nextReflection() {
  const index = Number.isInteger(requestedVerseIndex) ? requestedVerseIndex : nextVerseIndex;
  const reflection = reflections[index];
  if (!config.screenshot && !Number.isInteger(requestedVerseIndex)) saveJourney(index, reflection);
  return { reflection, position: index + 1 };
}

function rememberDraggedPosition() {
  if (programmaticMove || !companionWindow || companionWindow.isDestroyed()) return;
  restingPosition = geometry.draggedRestingPosition({
    position: companionWindow.getPosition(),
    size: companionWindow.getSize(),
    expanded: isExpanded
  });
  saveSettings();
}

function createWindow() {
  companionWindow = new BrowserWindow({
    ...computeBounds(false),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    title: "Krishna Companion",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  rendererReady = false;
  companionWindow.setAlwaysOnTop(true, "floating");
  companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  companionWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  companionWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  companionWindow.webContents.on("did-finish-load", () => { rendererReady = true; });
  companionWindow.loadFile(path.join(__dirname, "index.html"));
  companionWindow.on("moved", rememberDraggedPosition);
  companionWindow.on("closed", () => {
    companionWindow = undefined;
    rendererReady = false;
    // Reset expansion so a recreated window can show a teaching again; otherwise
    // isExpanded stays true and canShowTeaching refuses every future showCompanion.
    darshan.reset();
    isExpanded = false;
  });
}

function showRestingCompanion() {
  if (!companionWindow || companionWindow.isDestroyed()) return;
  if (darshan.phase !== "absent") return;
  isExpanded = false;
  companionWindow.hide();
  setGlass(false);
  setWidgetBounds(false);
  companionWindow.setFocusable(false);
  companionWindow.setIgnoreMouseEvents(true);
}

function collapseCompanion() {
  darshan.withdraw();
}

function showCompanion(force = false) {
  // A forced request (now, shortcut, tray) during a withdrawal cancels the pending
  // hide and re-arrives, rather than being acknowledged and then silently dropped
  // while the withdrawal timer hides the window. reset() clears that timer and returns
  // to absent; clearing isExpanded lets canShowTeaching and darshan.show proceed.
  if (force && darshan.phase === "withdrawing") {
    darshan.reset();
    isExpanded = false;
  }
  if (!canShowTeaching({ paused, isExpanded, force })) return false;
  if (!companionWindow || companionWindow.isDestroyed()) return false;
  if (!darshan.show(config.durationSeconds)) return false;
  // A darshan takes over the window, so end any in-flight voice capture: the helper
  // must not keep the microphone open behind a teaching the reader is already reading.
  voice.stopListening();
  isExpanded = true;
  previewEncounter = config.screenshot || Number.isInteger(requestedVerseIndex);
  encounterDuration = config.durationSeconds;
  readyForNext = false;
  readingHeight = READING_SIZE.height;
  // Native vibrancy fills the entire window, including the transparent arrival
  // stage. The message surface draws its own background instead.
  setGlass(false);
  companionWindow.setIgnoreMouseEvents(false);
  companionWindow.setFocusable(false);
  setWidgetBounds(true);
  companionWindow.showInactive();

  companionWindow.webContents.send("companion:show", {
    ...nextReflection(),
    ...MOTION_TIMINGS,
    style: settings.figure.style,
    durationSeconds: encounterDuration,
    preview: previewEncounter
  });
  return true;
}

function showNextVerse() {
  if (!isExpanded || previewEncounter || darshan.phase !== "present" || !readyForNext) return;
  if (!companionWindow || companionWindow.isDestroyed()) return;
  readyForNext = false;
  darshan.show(encounterDuration);
  readingHeight = READING_SIZE.height;
  // Only this explicit action may advance while a teaching is already open.
  companionWindow.webContents.send("companion:show", {
    ...nextReflection(), ...MOTION_TIMINGS, style: settings.figure.style, durationSeconds: encounterDuration, continuing: true
  });
}

function setListening(active) {
  if (!companionWindow || companionWindow.isDestroyed()) return;
  // Listening feedback lives in the tray; absence does not reveal an idle figure.
  if (tray) tray.setToolTip(active ? "Krishna Companion — Listening…" : "Krishna Companion");
  companionWindow.webContents.send("companion:listening", active);
}

function showVoiceNotice(body) {
  if (voiceNoticeShown) return;
  voiceNoticeShown = true;
  if (tray) tray.setToolTip(`Krishna Companion — ${body}`);
  try {
    if (Notification.isSupported()) {
      new Notification({ title: "Krishna Companion voice", body }).show();
    }
  } catch {
    // The tray tooltip remains as the once-per-launch notice.
  }
}

// One product-chrome notification for damaged files repaired this launch. The text
// is fixed chrome plus our own quarantine filenames (derived from the app's own
// paths, never from untrusted input), so no corpus or outside text reaches it (C3).
function notifyQuarantines() {
  if (quarantined.length === 0) return;
  const repaired = quarantined.filter((item) => item.quarantinedTo).map((item) => path.basename(item.quarantinedTo));
  const untouched = quarantined.filter((item) => !item.quarantinedTo).map((item) => path.basename(item.file));
  const parts = [];
  if (repaired.length) {
    parts.push(`repaired ${repaired.length === 1 ? "a damaged file" : "damaged files"}, kept as ${repaired.join(", ")}`);
  }
  if (untouched.length) {
    parts.push(`could not repair ${untouched.join(", ")} and left ${untouched.length === 1 ? "it" : "them"} untouched`);
  }
  const body = `Krishna Companion ${parts.join("; ")}.`;
  if (tray) tray.setToolTip(`Krishna Companion — ${body}`);
  try {
    if (Notification.isSupported()) new Notification({ title: "Krishna Companion", body }).show();
  } catch {
    // The tray tooltip remains as the notice.
  }
}

function showShortcutNotice(body) {
  try {
    if (Notification.isSupported()) new Notification({ title: "Krishna Companion", body }).show();
  } catch {
    // No notification centre available; the stderr line remains the record.
  }
}

// The voice runtime (src/voice-runtime.js) owns all voice state; it receives its
// Electron/native pieces and the app state it reacts to through this factory. loadHook is
// lazy so nothing requires the native key hook until voice actually starts.
const voice = createVoiceRuntime({
  platform: process.platform,
  spawn,
  systemPreferences,
  existsSync,
  helperPath,
  helperBuildPath,
  projectRoot,
  listenTimeoutMs: LISTEN_TIMEOUT_MS,
  loadHook: () => require("uiohook-napi"),
  observeHold,
  createFrontmostAppGate,
  containsInvocation,
  getVoiceSettings: () => settings.voice,
  isExpanded: () => isExpanded,
  setListening,
  notify: showVoiceNotice,
  onMatch: () => showCompanion(true)
});

function setVoiceEnabled(enabled) {
  settings.voice.enabled = enabled;
  saveSettings();
  if (enabled) voice.initialize();
  else voice.stop();
  if (tray) tray.setContextMenu(trayMenu());
}

function cadenceIntervalMs() {
  return config.intervalMinutes * 60 * 1000;
}

// Run the pure reconciler (src/cadence.js) against the real wall clock and act on its
// decision: advance the schedule, fire AT MOST ONE darshan if one came due (a normal
// boundary, or time that elapsed during sleep, a pause, or an open card), and persist the
// corrected nextReflectionAt. Never fires more than one darshan for many missed intervals.
function reconcileCadenceNow() {
  const decision = reconcileCadence({
    now: Date.now(),
    nextReflectionAt,
    intervalMs: cadenceIntervalMs(),
    paused,
    isExpanded
  });
  nextReflectionAt = decision.nextReflectionAt;
  if (decision.due) showCompanion();
  saveState();
}

function restartCadence(minutes = config.intervalMinutes) {
  clearInterval(cadenceTimer);
  nextReflectionAt = Date.now() + minutes * 60 * 1000;
  cadenceTimer = setInterval(reconcileCadenceNow, minutes * 60 * 1000);
  saveState();
}

// Sleep/wake reconciliation (Codex defect #5). Node's timers are suspended while the
// machine sleeps, so on wake the interval is behind the wall clock. Re-run the reconciler
// against the real clock (firing once if a boundary passed during sleep) and re-arm the
// interval so later ticks stay aligned rather than drifting. Wired to powerMonitor
// resume/unlock-screen. The reconciler guards paused/expanded, so a wake behind an open
// card or a paused loop never fires.
function reconcileAfterWake() {
  clearInterval(cadenceTimer);
  reconcileCadenceNow();
  cadenceTimer = setInterval(reconcileCadenceNow, cadenceIntervalMs());
}

// Show a darshan for a `now` invocation. Acknowledge and show only when a window can
// display it, else skip so the CLI exits 2 and the hook passes the prompt through. If the
// renderer has not finished loading, defer the reveal to did-finish-load: sending
// companion:show before then loses the teaching and advances the saved journey past a verse
// the reader never saw. nextReflection/saveJourney run inside reveal(), so the journey only
// advances once the show is actually delivered to a ready renderer.
function revealNow({ index, durationSeconds } = {}) {
  const recreated = !companionWindow || companionWindow.isDestroyed();
  if (recreated) createWindow();
  if (!windowCanAcknowledge(companionWindow)) return;
  const reveal = () => {
    acknowledgeCommand("now");
    // A specific verse or a one-off duration applies to this showing only: save and
    // restore the sequence override and the configured duration around the show, so
    // scheduled darshans keep following the saved journey at the normal cadence.
    const previousRequested = requestedVerseIndex;
    const previousDuration = config.durationSeconds;
    if (Number.isInteger(index)) requestedVerseIndex = index;
    if (Number.isFinite(durationSeconds)) config.durationSeconds = durationSeconds;
    showCompanion(true);
    requestedVerseIndex = previousRequested;
    config.durationSeconds = previousDuration;
  };
  if (rendererReady) reveal();
  else companionWindow.webContents.once("did-finish-load", reveal);
}

// Apply a config handed in by a second launch to this running instance. Pure decision
// in second-instance.js; this only carries it out.
function applySecondInstance(incoming) {
  const { actions, rejected } = planSecondInstance(incoming);
  for (const { field, reason } of rejected) {
    console.error(`Krishna Companion: ignored invalid second-instance ${field} (${reason})`);
  }
  for (const action of actions) {
    switch (action.type) {
      case "set-interval":
        config.intervalMinutes = action.minutes;
        restartCadence(action.minutes);
        if (tray) tray.setContextMenu(trayMenu());
        break;
      case "show": {
        let index;
        if (action.verse) {
          const result = findVerseIndex(reflections, action.verse);
          if (result.error) {
            console.error(`Krishna Companion: ${result.error}`);
            break;
          }
          index = result.index;
        }
        revealNow({ index, durationSeconds: action.durationSeconds });
        break;
      }
      case "command":
        handleCommand(action.name);
        break;
      case "screenshot":
        captureScreenshotAndQuit(incoming?.demo);
        break;
      default:
        break;
    }
  }
}

// Capture the current window to the preview file, then quit. Used by --screenshot on
// a direct launch and when forwarded to a running instance.
function captureScreenshotAndQuit(demo = config.demo) {
  setTimeout(async () => {
    try {
      if (!companionWindow || companionWindow.isDestroyed()) return;
      const preview = await companionWindow.webContents.capturePage();
      const previewName = demo ? "preview.png" : "resting-preview.png";
      const mediaDir = path.join(__dirname, "..", "docs", "media");
      await mkdir(mediaDir, { recursive: true });
      await writeFile(path.join(mediaDir, previewName), preview.toPNG());
    } catch (error) {
      process.stderr.write(`Krishna Companion could not save the preview: ${safeLabel(error?.message || error, 200)}\n`);
      // A failed capture must be visible to a script that ran `npm run preview`.
      app.exit(1);
      return;
    } finally {
      // Whatever happened above, the screenshot launch must terminate.
      app.quit();
    }
  }, SCREENSHOT_DELAY_MS);
}

function handleCommand(command) {
  switch (command) {
    case "pause":
      paused = true;
      collapseCompanion();
      break;
    case "resume":
      // Explicit unpause. `resume` is the only command that clears a persisted pause.
      paused = false;
      restartCadence();
      showRestingCompanion();
      break;
    case "live":
    case "start":
      // Ensure the loop is running, but HONOUR a persisted pause (Codex defect #5). A plain
      // relaunch carries the defaulted command "live"; clearing pause here would forget the
      // reader's pause on every restart, exactly the bug this batch fixes. Unpausing is the
      // job of `resume` and the tray toggle. (planSecondInstance already refuses to forward a
      // defaulted "live" for the same reason — see test/second-instance.test.js.)
      restartCadence();
      showRestingCompanion();
      break;
    case "now":
    case "/krshna":
      revealNow();
      break;
    case "voice-on":
      setVoiceEnabled(true);
      break;
    case "voice-off":
      setVoiceEnabled(false);
      break;
    case "stop":
      app.quit();
      return;
    default:
      if (command.startsWith(STYLE_COMMAND_PREFIX)) {
        const style = command.slice(STYLE_COMMAND_PREFIX.length);
        if (FIGURE_STYLES.includes(style)) {
          setFigureStyle(style);
          break;
        }
      }
      return;
  }
  saveState();
}

// Switch the figure's sprite style: persisted in settings.json, applied live to the
// renderer (a present darshan changes on the spot), reflected in the tray radio group.
function setFigureStyle(style) {
  settings.figure = { style: normalizeFigureStyle(style) };
  saveSettings();
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.webContents.send("companion:style", settings.figure.style);
  }
  if (tray) tray.setContextMenu(trayMenu());
}

function trayMenu() {
  return Menu.buildFromTemplate(buildTrayMenuTemplate({
    paused,
    intervalMinutes: config.intervalMinutes,
    figureStyle: settings.figure.style,
    voiceEnabled: settings.voice.enabled,
    figureStyles: FIGURE_STYLES,
    onShowNow: () => showCompanion(true),
    onTogglePause: () => {
      paused = !paused;
      if (paused) collapseCompanion();
      saveState();
      tray.setContextMenu(trayMenu());
    },
    onSetInterval: (minutes) => {
      config.intervalMinutes = minutes;
      restartCadence(minutes);
      tray.setContextMenu(trayMenu());
    },
    onSetStyle: setFigureStyle,
    onSetVoiceEnabled: setVoiceEnabled
  }));
}

function createTray() {
  // PNG, not SVG: nativeImage decodes only PNG/JPEG; trayTemplate@2x.png is picked up automatically.
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "trayTemplate.png"));
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Krishna Companion");
  tray.setContextMenu(trayMenu());
  tray.on("click", () => showCompanion(true));
}

if (instanceLock) app.on("second-instance", (_event, _argv, _directory, additionalData) => {
  applySecondInstance(additionalData || { command: "now" });
});

if (instanceLock) app.whenReady().then(() => {
  // Electron's userData is the app's directory of record; src/paths.js reconstructs the
  // same default for the CLI and documents the platform rules, and the CLI's tests point
  // KRSHNA_HOME at a temp directory. The app itself never follows HOME or KRSHNA_HOME, so
  // a launch from a modified environment cannot move the user's state.
  const userData = app.getPath("userData");
  statePath = path.join(userData, "state.json");
  journeyPath = path.join(userData, "journey.json");
  settingsPath = path.join(userData, "settings.json");
  readPersistentData();
  if (process.platform === "darwin") app.dock?.hide();
  createWindow();
  createTray();
  notifyQuarantines();
  restartCadence();
  // Sleep/wake reconciliation (Codex defect #5). powerMonitor is a built-in Electron
  // module, so this adds no dependency. Guard it: the in-memory test harness's electron
  // double has no powerMonitor, and any non-Electron path must be a no-op. unlock-screen
  // covers a lid-open that the OS reports as an unlock rather than a resume.
  if (powerMonitor && typeof powerMonitor.on === "function") {
    powerMonitor.on("resume", reconcileAfterWake);
    powerMonitor.on("unlock-screen", reconcileAfterWake);
  }
  voice.initialize();

  const shortcutRegistered = globalShortcut.register(SHORTCUT, () => showCompanion(true));
  if (!shortcutRegistered) {
    const message = shortcutUnavailableMessage(SHORTCUT);
    console.error(`Krishna Companion: ${message}`);
    showShortcutNotice(message);
  }
  companionWindow.webContents.once("did-finish-load", () => {
    showRestingCompanion();
    setTimeout(() => {
      if (config.command === "now") revealNow();
      else if (config.demo || config.provided.verse) showCompanion(true);
      else if (!config.screenshot && journey.history.length === 0 && ["live", "start"].includes(config.command)) showCompanion(true);
      else handleCommand(config.command);

      if (config.screenshot) captureScreenshotAndQuit();
    }, BOOT_DELAY_MS);
  });
});

ipcMain.on("companion:dismiss", collapseCompanion);
ipcMain.on("companion:expand", () => darshan.expand());
ipcMain.on("companion:next", showNextVerse);
ipcMain.on("companion:ready", () => { if (darshan.phase === "present") readyForNext = true; });
ipcMain.on("companion:engage", () => {
  if (!isExpanded || !companionWindow || companionWindow.isDestroyed()) return;
  companionWindow.setFocusable(true);
  companionWindow.focus();
});
ipcMain.on("companion:resize", (_event, height) => {
  if (!isExpanded || !companionWindow || companionWindow.isDestroyed()) return;
  if (!Number.isFinite(height)) return;
  readingHeight = Math.max(READING_SIZE.height, Math.ceil(height));
  // Avoid needless native moves while measuring an unchanged message.
  const bounds = computeBounds(true);
  const current = companionWindow.getBounds();
  if (Object.keys(bounds).some((key) => bounds[key] !== current[key])) setWidgetBounds(true);
});
ipcMain.on("companion:open-source", (_event, url) => {
  if (reflections.some((item) => item.source === url)) shell.openExternal(url);
});

app.on("activate", () => { if (!companionWindow) createWindow(); });
app.on("window-all-closed", () => {});
app.on("will-quit", () => {
  saveState(false);
  globalShortcut.unregisterAll();
  clearInterval(cadenceTimer);
  darshan.reset();
  voice.stop();
});
