const path = require("node:path");
const { existsSync } = require("node:fs");
const { writeFile } = require("node:fs/promises");
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
  screen,
  shell,
  systemPreferences
} = require("electron");
const { readConfig } = require("./config");
const { reflections, findVerseIndex } = require("./content");
const { readJson, writeJson } = require("./store");
const { normalizeJourney, recordTeaching } = require("./journey");
const { canShowTeaching } = require("./schedule");
const { containsInvocation } = require("./voice");
const { windowCanAcknowledge } = require("./ack");
const { planSecondInstance } = require("./second-instance");
const { shortcutUnavailableMessage } = require("./shortcut");
const { resetOnWindowClosed } = require("./window-state");
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

// Exactly 10% smaller than the previous 176 × 224 resting widget.
const RESTING_SIZE = { width: 158, height: 202 };
// Reading height is a floor: the renderer reports how tall the verbatim text needs the card to be.
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
const projectRoot = path.join(__dirname, "..");
const helperPath = path.join(projectRoot, "helpers", "listen");
const helperBuildPath = path.join(projectRoot, "scripts", "build-helper.sh");
const config = readConfig();
let readingHeight = READING_SIZE.height;

let companionWindow;
let tray;
let cadenceTimer;
let dismissTimer;
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
let voiceHook;
let voiceObserver;
let listeningSession;
let voiceDisabledForLaunch = false;
let voiceNoticeShown = false;
let helperBuildStarted = false;
let previewEncounter = false;
let encounterDuration = 0;
let readyForNext = false;
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

// Files that were found corrupt and moved aside during this launch. Turned into one
// startup notification so the reader learns their originals were kept, not lost.
const quarantined = [];

function readPersistentData() {
  const oldState = readJson(statePath, {}, quarantined);
  const savedJourney = readJson(journeyPath, null, quarantined);
  const savedSettings = readJson(settingsPath, {}, quarantined);

  settings = {
    ...savedSettings,
    version: 1,
    voice: {
      ...DEFAULT_VOICE_SETTINGS,
      ...(savedSettings.voice || {})
    }
  };
  settings.voice.enabled = settings.voice.enabled !== false;
  settings.voice.key = typeof settings.voice.key === "string" ? settings.voice.key : DEFAULT_VOICE_SETTINGS.key;
  settings.voice.holdMs = Number.isFinite(settings.voice.holdMs) && settings.voice.holdMs >= 250
    ? settings.voice.holdMs
    : DEFAULT_VOICE_SETTINGS.holdMs;

  journey = normalizeJourney(savedJourney, reflections.length, oldState.nextVerseIndex || 0);

  nextVerseIndex = journey.nextVerseIndex;
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
  if (Number.isFinite(settings.restingPosition?.x) && Number.isFinite(settings.restingPosition?.y)) {
    restingPosition = settings.restingPosition;
  }
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
    voice: { ...settings.voice }
  };
  if (restingPosition) settings.restingPosition = restingPosition;
  writeJson(settingsPath, settings);
}

function displayForPoint(point) {
  return screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) });
}

function defaultRestingPosition() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return {
    x: Math.round(workArea.x + workArea.width - RESTING_SIZE.width - SCREEN_MARGIN),
    y: Math.round(workArea.y + workArea.height - RESTING_SIZE.height - SCREEN_MARGIN)
  };
}

function clampedRestingPosition(position = restingPosition || defaultRestingPosition()) {
  const display = displayForPoint({
    x: position.x + RESTING_SIZE.width / 2,
    y: position.y + RESTING_SIZE.height / 2
  });
  const { workArea } = display;
  return {
    x: Math.min(Math.max(position.x, workArea.x), workArea.x + workArea.width - RESTING_SIZE.width),
    y: Math.min(Math.max(position.y, workArea.y), workArea.y + workArea.height - RESTING_SIZE.height)
  };
}

function widgetBounds(expanded) {
  restingPosition = clampedRestingPosition();
  if (!expanded) return { ...restingPosition, ...RESTING_SIZE };

  const display = displayForPoint(restingPosition);
  const { workArea } = display;
  const height = Math.min(readingHeight, workArea.height - SCREEN_MARGIN * 2);
  const width = Math.min(READING_SIZE.width, workArea.width - SCREEN_MARGIN * 2);
  const desired = {
    x: restingPosition.x - (width - RESTING_SIZE.width),
    y: restingPosition.y - (height - RESTING_SIZE.height)
  };
  return {
    width,
    height,
    x: Math.min(Math.max(desired.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(desired.y, workArea.y), workArea.y + workArea.height - height)
  };
}

function setWidgetBounds(expanded) {
  programmaticMove = true;
  companionWindow.setBounds(widgetBounds(expanded), false);
  setTimeout(() => { programmaticMove = false; }, 100);
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
  const [x, y] = companionWindow.getPosition();
  const [width, height] = companionWindow.getSize();
  restingPosition = isExpanded
    ? { x: x + width - RESTING_SIZE.width, y: y + height - RESTING_SIZE.height }
    : { x, y };
  restingPosition = clampedRestingPosition(restingPosition);
  saveSettings();
}

function createWindow() {
  companionWindow = new BrowserWindow({
    ...widgetBounds(false),
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

  companionWindow.setAlwaysOnTop(true, "floating");
  companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  companionWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  companionWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  companionWindow.loadFile(path.join(__dirname, "index.html"));
  companionWindow.on("moved", rememberDraggedPosition);
  companionWindow.on("closed", () => {
    companionWindow = undefined;
    // Reset expansion and drop the per-card timer so a recreated window can show a
    // teaching again; otherwise isExpanded stays true and canShowTeaching refuses.
    clearTimeout(dismissTimer);
    darshan.reset();
    ({ isExpanded, dismissTimer } = resetOnWindowClosed({ isExpanded, dismissTimer }));
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
  clearTimeout(dismissTimer);
  dismissTimer = undefined;
  darshan.withdraw();
}

function showCompanion(force = false) {
  if (!canShowTeaching({ paused, isExpanded, force })) return false;
  if (!companionWindow || companionWindow.isDestroyed()) return false;
  if (!darshan.show(config.durationSeconds)) return false;
  stopListening();
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
    durationSeconds: encounterDuration,
    preview: previewEncounter
  });

  clearTimeout(dismissTimer);
  dismissTimer = undefined;
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
    ...nextReflection(), ...MOTION_TIMINGS, durationSeconds: encounterDuration, continuing: true
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

function stopListening(session = listeningSession, { kill = true } = {}) {
  if (!session || session !== listeningSession) return;
  listeningSession = undefined;
  clearTimeout(session.timeout);
  setListening(false);
  if (kill && session.child.exitCode === null && session.child.signalCode === null) {
    session.child.kill();
  }
}

function stopVoiceHook() {
  stopListening();
  voiceObserver?.stop();
  voiceObserver = undefined;
  if (voiceHook) {
    try {
      voiceHook.stop();
    } catch {
      // A partially loaded native hook is still allowed to fail closed.
    }
  }
  voiceHook = undefined;
}

function disableVoiceForLaunch(message, { log = false } = {}) {
  if (voiceDisabledForLaunch) return;
  voiceDisabledForLaunch = true;
  stopVoiceHook();
  if (log) console.error(message);
  showVoiceNotice(message);
}

function startListening() {
  if (listeningSession || isExpanded || voiceDisabledForLaunch || !settings.voice.enabled) return false;

  // This presents macOS's Accessibility prompt; uiohook itself presents Input Monitoring when needed.
  try {
    systemPreferences.isTrustedAccessibilityClient(true);
  } catch {
    // Input Monitoring may already be sufficient for this hook.
  }

  let child;
  try {
    child = spawn(helperPath, [`--timeout=${LISTEN_TIMEOUT_MS}`], {
      stdio: ["pipe", "pipe", "ignore"]
    });
  } catch {
    disableVoiceForLaunch("Krishna Companion voice is unavailable for this launch.", { log: true });
    return false;
  }

  const session = { child, buffer: "", timeout: undefined };
  listeningSession = session;
  setListening(true);
  session.timeout = setTimeout(() => stopListening(session), LISTEN_TIMEOUT_MS);

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (listeningSession !== session) return;
    session.buffer += chunk;
    let newline = session.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = session.buffer.slice(0, newline).replace(/\r$/, "");
      session.buffer = session.buffer.slice(newline + 1);
      if (containsInvocation(line)) {
        stopListening(session);
        showCompanion(true);
        return;
      }
      newline = session.buffer.indexOf("\n");
    }
  });

  child.once("error", () => {
    if (listeningSession !== session) return;
    stopListening(session, { kill: false });
    disableVoiceForLaunch("Krishna Companion voice is unavailable for this launch.", { log: true });
  });
  child.once("close", (code) => {
    if (listeningSession === session) stopListening(session, { kill: false });
    if ([2, 3, 4].includes(code)) {
      disableVoiceForLaunch(
        "Allow Microphone and Speech Recognition for Krishna Companion in System Settings"
      );
    }
  });
  return true;
}

function startVoiceHook() {
  if (process.platform !== "darwin" || voiceHook || voiceDisabledForLaunch || !settings.voice.enabled) return;

  let nativeHook;
  let keyCodes;
  try {
    ({ uIOhook: nativeHook, UiohookKey: keyCodes } = require("uiohook-napi"));
  } catch {
    disableVoiceForLaunch("Krishna Companion voice unavailable: global key hook could not load.", { log: true });
    return;
  }

  const triggerKey = keyCodes[settings.voice.key];
  if (!Number.isInteger(triggerKey)) {
    disableVoiceForLaunch(`Krishna Companion voice unavailable: unknown key ${settings.voice.key}.`, { log: true });
    return;
  }

  voiceHook = nativeHook;
  voiceObserver = observeHold({
    eventSource: nativeHook,
    triggerKey,
    holdMs: settings.voice.holdMs,
    isFrontmostAllowed: createFrontmostAppGate(),
    onTrigger: startListening,
    onRelease: () => stopListening()
  });

  try {
    nativeHook.start();
  } catch {
    disableVoiceForLaunch("Krishna Companion voice unavailable: global key hook could not start.", { log: true });
  }
}

function initializeVoice() {
  if (process.platform !== "darwin" || !settings.voice.enabled || voiceDisabledForLaunch) return;
  if (existsSync(helperPath)) {
    startVoiceHook();
    return;
  }
  if (helperBuildStarted) return;
  helperBuildStarted = true;

  const build = spawn("/bin/bash", [helperBuildPath], {
    cwd: projectRoot,
    stdio: "ignore"
  });
  build.once("error", () => {
    disableVoiceForLaunch("Krishna Companion voice unavailable: Xcode Command Line Tools are required.", { log: true });
  });
  build.once("close", (code) => {
    if (code === 0 && existsSync(helperPath)) startVoiceHook();
    else disableVoiceForLaunch(
      "Krishna Companion voice unavailable: Xcode Command Line Tools are required.",
      { log: true }
    );
  });
}

function setVoiceEnabled(enabled) {
  settings.voice.enabled = enabled;
  saveSettings();
  if (enabled) initializeVoice();
  else stopVoiceHook();
  if (tray) tray.setContextMenu(trayMenu());
}

function restartCadence(minutes = config.intervalMinutes) {
  clearInterval(cadenceTimer);
  nextReflectionAt = Date.now() + minutes * 60 * 1000;
  cadenceTimer = setInterval(() => {
    showCompanion();
    nextReflectionAt = Date.now() + minutes * 60 * 1000;
    saveState();
  }, minutes * 60 * 1000);
  saveState();
}

// Show a darshan for a `now` invocation. Recreate the window if the app is alive
// without one; acknowledge (which blocks the prompt in the hook) and show only when
// a window can actually display it, otherwise skip so the CLI exits 2 and the hook
// passes the prompt through. When the window was just recreated its renderer is
// still loading, so defer the reveal to did-finish-load — sending companion:show
// before then would lose the teaching and flash a blank card.
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
  if (recreated) companionWindow.webContents.once("did-finish-load", reveal);
  else reveal();
}

// Apply a config handed in by a second launch to this running instance. Pure decision
// in second-instance.js; this only carries it out.
function applySecondInstance(incoming) {
  const { actions, rejected } = planSecondInstance(incoming, { intervalMinutes: config.intervalMinutes });
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
    if (!companionWindow || companionWindow.isDestroyed()) {
      app.quit();
      return;
    }
    const preview = await companionWindow.webContents.capturePage();
    const previewName = demo ? "preview.png" : "resting-preview.png";
    await writeFile(path.join(__dirname, "..", previewName), preview.toPNG());
    app.quit();
  }, 2600);
}

function handleCommand(command) {
  switch (command) {
    case "pause":
      paused = true;
      collapseCompanion();
      break;
    case "resume":
      paused = false;
      restartCadence();
      showRestingCompanion();
      break;
    case "live":
    case "start":
      paused = false;
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
      return;
  }
  saveState();
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: "Next teaching now", click: () => showCompanion(true) },
    { type: "separator" },
    {
      label: paused ? "Resume teachings" : "Pause teachings",
      click: () => {
        paused = !paused;
        if (paused) collapseCompanion();
        saveState();
        tray.setContextMenu(trayMenu());
      }
    },
    {
      label: "Every",
      submenu: [30, 60, 90].map((minutes) => ({
        label: `${minutes} minutes`,
        type: "radio",
        checked: config.intervalMinutes === minutes,
        click: () => {
          config.intervalMinutes = minutes;
          restartCadence(minutes);
          tray.setContextMenu(trayMenu());
        }
      }))
    },
    {
      label: "Voice (hold Space)",
      type: "checkbox",
      checked: settings.voice.enabled,
      click: (item) => setVoiceEnabled(item.checked)
    },
    { type: "separator" },
    { label: "Quit Krishna Companion", role: "quit" }
  ]);
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
  initializeVoice();

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
    }, 450);
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
  const bounds = widgetBounds(true);
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
  clearTimeout(dismissTimer);
  darshan.reset();
  stopVoiceHook();
});
