const path = require("node:path");
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { writeFile } = require("node:fs/promises");
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell
} = require("electron");
const { readConfig } = require("./config");
const { reflections } = require("./content");
const { normalizeJourney, recordTeaching } = require("./journey");
const { canShowTeaching } = require("./schedule");

// Exactly 10% smaller than the previous 176 × 224 resting widget.
const RESTING_SIZE = { width: 158, height: 202 };
// Reading height is a floor: the renderer reports how tall the verbatim text needs the card to be.
const READING_SIZE = { width: 510, height: 326 };
const SCREEN_MARGIN = 14;
// ⌘⌥K / Ctrl+Alt+K: ⌘⇧K is "Delete Line" in VS Code and would be stolen from every editor.
const SHORTCUT = "CommandOrControl+Alt+K";
const config = readConfig();
let readingHeight = READING_SIZE.height;

let companionWindow;
let tray;
let cadenceTimer;
let dismissTimer;
let paused = false;
let nextReflectionAt;
let nextVerseIndex = 0;
let statePath;
let journeyPath;
let settingsPath;
let journey = { version: 1, nextVerseIndex: 0, history: [] };
let restingPosition;
let isExpanded = false;
let programmaticMove = false;

const instanceLock = app.requestSingleInstanceLock({ command: config.command });
if (!instanceLock) app.quit();

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporaryPath, filePath);
}

function readPersistentData() {
  const oldState = readJson(statePath, {});
  const savedJourney = readJson(journeyPath, null);
  const settings = readJson(settingsPath, {});

  journey = normalizeJourney(savedJourney, reflections.length, oldState.nextVerseIndex || 0);

  nextVerseIndex = journey.nextVerseIndex;
  if (config.verse) {
    // --verse=1.32-35 previews one specific teaching without touching the saved journey.
    const requested = reflections.findIndex((item) => `${item.chapterNumber}.${item.verse}` === config.verse);
    if (requested !== -1) nextVerseIndex = requested;
  }
  if (Number.isFinite(settings?.restingPosition?.x) && Number.isFinite(settings?.restingPosition?.y)) {
    restingPosition = settings.restingPosition;
  }
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
    lastReference: last?.reference
  });
}

function saveJourney(index, reflection) {
  journey = recordTeaching(journey, index, reflection, new Date().toISOString(), reflections.length);
  nextVerseIndex = journey.nextVerseIndex;
  writeJson(journeyPath, journey);
  saveState();
}

function saveSettings() {
  if (!settingsPath || !restingPosition) return;
  writeJson(settingsPath, { version: 1, restingPosition });
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
  const desired = {
    x: restingPosition.x - (READING_SIZE.width - RESTING_SIZE.width),
    y: restingPosition.y - (height - RESTING_SIZE.height)
  };
  return {
    width: READING_SIZE.width,
    height,
    x: Math.min(Math.max(desired.x, workArea.x), workArea.x + workArea.width - READING_SIZE.width),
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
  const index = nextVerseIndex;
  const reflection = reflections[index];
  if (!config.screenshot) saveJourney(index, reflection);
  return { reflection, position: index + 1 };
}

function rememberDraggedPosition() {
  if (programmaticMove || !companionWindow || companionWindow.isDestroyed()) return;
  const [x, y] = companionWindow.getPosition();
  const [, height] = companionWindow.getSize();
  restingPosition = isExpanded
    ? { x: x + READING_SIZE.width - RESTING_SIZE.width, y: y + height - RESTING_SIZE.height }
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
  companionWindow.on("closed", () => { companionWindow = undefined; });
}

function showRestingCompanion() {
  if (!companionWindow || companionWindow.isDestroyed()) return;
  isExpanded = false;
  setGlass(false);
  setWidgetBounds(false);
  companionWindow.setFocusable(false);
  companionWindow.setIgnoreMouseEvents(false);
  companionWindow.showInactive();
}

function collapseCompanion() {
  clearTimeout(dismissTimer);
  dismissTimer = undefined;
  if (!companionWindow || companionWindow.isDestroyed()) return;
  companionWindow.webContents.send("companion:collapse");
  setTimeout(showRestingCompanion, 380);
}

function showCompanion(force = false) {
  if (!canShowTeaching({ paused, isExpanded, force })) return false;
  if (!companionWindow || companionWindow.isDestroyed()) return false;
  isExpanded = true;
  readingHeight = READING_SIZE.height;
  setGlass(true);
  companionWindow.setIgnoreMouseEvents(false);
  companionWindow.setFocusable(false);
  setWidgetBounds(true);
  companionWindow.showInactive();

  companionWindow.webContents.send("companion:show", {
    ...nextReflection(),
    durationSeconds: config.durationSeconds
  });

  clearTimeout(dismissTimer);
  dismissTimer = undefined;
  if (config.durationSeconds > 0) {
    dismissTimer = setTimeout(collapseCompanion, config.durationSeconds * 1000);
  }
  return true;
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
      showCompanion(true);
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
  handleCommand(additionalData?.command || "now");
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
  restartCadence();

  globalShortcut.register(SHORTCUT, () => showCompanion(true));
  companionWindow.webContents.once("did-finish-load", () => {
    showRestingCompanion();
    setTimeout(() => {
      if (config.demo || config.command === "now") showCompanion(true);
      else handleCommand(config.command);

      if (!config.screenshot) return;
      setTimeout(async () => {
        const preview = await companionWindow.webContents.capturePage();
        const previewName = config.demo ? "preview.png" : "resting-preview.png";
        await writeFile(path.join(__dirname, "..", previewName), preview.toPNG());
        app.quit();
      }, 2600);
    }, 450);
  });
});

ipcMain.on("companion:dismiss", collapseCompanion);
ipcMain.on("companion:engage", () => {
  if (!isExpanded || !companionWindow || companionWindow.isDestroyed()) return;
  companionWindow.setFocusable(true);
  companionWindow.focus();
});
ipcMain.on("companion:resize", (_event, height) => {
  if (!isExpanded || !companionWindow || companionWindow.isDestroyed()) return;
  if (!Number.isFinite(height)) return;
  readingHeight = Math.max(READING_SIZE.height, Math.ceil(height));
  setWidgetBounds(true);
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
});
