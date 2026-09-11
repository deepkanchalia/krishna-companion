const { execFileSync } = require("node:child_process");

const DEFAULT_VOICE_SETTINGS = Object.freeze({
  // Off by default: a first launch of the core loop needs no permissions, but a live
  // key hook would raise up to five macOS prompts (Input Monitoring, Accessibility,
  // Automation, Microphone, Speech). Voice is enabled from the tray or `krshna voice-on`.
  enabled: false,
  key: "Space",
  holdMs: 2_000
});

// The only trigger-key names the hook accepts. Each is a real UiohookKey name, so a
// value taken from settings.json is validated against this fixed list before it can
// reach the hook or any display sink (C3); anything else falls back to the default.
const SUPPORTED_VOICE_KEYS = Object.freeze([
  "Space", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"
]);

function normalizeVoiceKey(key) {
  return SUPPORTED_VOICE_KEYS.includes(key) ? key : DEFAULT_VOICE_SETTINGS.key;
}

const FRONTMOST_BUNDLE_IDS = new Set([
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "dev.warp.Warp",
  "dev.warp.Warp-Stable",
  "com.mitchellh.ghostty",
  "org.alacritty",
  "net.kovidgoyal.kitty",
  "com.github.wez.wezterm",
  "com.microsoft.VSCode",
  "com.microsoft.VSCodeInsiders",
  "com.todesktop.230313mzl4w4u92",
  "dev.zed.Zed",
  "com.apple.dt.Xcode",
  "com.exafunction.windsurf"
]);

const FRONTMOST_SCRIPT = [
  "tell application \"System Events\"",
  "get bundle identifier of first application process whose frontmost is true",
  "end tell"
].join("\n");

function isAllowedBundleId(bundleId) {
  return typeof bundleId === "string"
    && (FRONTMOST_BUNDLE_IDS.has(bundleId) || bundleId.startsWith("com.jetbrains."));
}

function createFrontmostAppGate({
  now = Date.now,
  readBundleId = () => execFileSync("/usr/bin/osascript", ["-e", FRONTMOST_SCRIPT], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 750
  }).trim(),
  cacheMs = 1_000
} = {}) {
  let cachedAt = -Infinity;
  let cachedResult = false;

  return function frontmostAppIsAllowed() {
    const timestamp = now();
    if (timestamp - cachedAt < cacheMs) return cachedResult;

    cachedAt = timestamp;
    try {
      cachedResult = isAllowedBundleId(readBundleId());
    } catch {
      cachedResult = false;
    }
    return cachedResult;
  };
}

function createHoldStateMachine({
  triggerKey,
  holdMs = DEFAULT_VOICE_SETTINGS.holdMs,
  now = Date.now,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  isFrontmostAllowed = () => true,
  onTrigger = () => {},
  onRelease = () => {}
}) {
  let pressedAt;
  let timer;
  let cancelled = false;
  let triggered = false;

  function clearTimer() {
    if (timer !== undefined) cancelSchedule(timer);
    timer = undefined;
  }

  function advance(timestamp = now()) {
    if (pressedAt === undefined || cancelled || triggered) return false;
    if (timestamp - pressedAt < holdMs) return false;

    // The frontmost-app gate is a synchronous osascript call; consult it only here, when
    // the hold has actually reached holdMs, never on keydown (which fires on every Space
    // press). A disallowed app cancels this hold without triggering.
    if (!isFrontmostAllowed()) {
      cancelled = true;
      clearTimer();
      return false;
    }

    clearTimer();
    triggered = onTrigger() !== false;
    return triggered;
  }

  function keydown(event) {
    if (event.keycode !== triggerKey) {
      if (pressedAt !== undefined && !triggered) {
        cancelled = true;
        clearTimer();
      }
      return false;
    }

    // A repeated keydown is the same physical hold; it must not restart the clock.
    if (pressedAt !== undefined) return false;

    pressedAt = now();
    cancelled = false;
    // The frontmost gate is not consulted here: keydown fires on every trigger-key press,
    // so gating happens once in advance() when the hold completes.
    timer = schedule(() => advance(), holdMs);
    return false;
  }

  function keyup(event) {
    if (event.keycode !== triggerKey || pressedAt === undefined) return false;

    clearTimer();
    const shouldRelease = triggered;
    pressedAt = undefined;
    cancelled = false;
    triggered = false;
    if (shouldRelease) onRelease();
    return shouldRelease;
  }

  function reset() {
    clearTimer();
    if (triggered) onRelease();
    pressedAt = undefined;
    cancelled = false;
    triggered = false;
  }

  return { advance, keydown, keyup, reset };
}

function observeHold({ eventSource, ...options }) {
  const machine = createHoldStateMachine(options);
  const onKeydown = (event) => machine.keydown(event);
  const onKeyup = (event) => machine.keyup(event);

  eventSource.on("keydown", onKeydown);
  eventSource.on("keyup", onKeyup);

  return {
    machine,
    stop() {
      eventSource.off("keydown", onKeydown);
      eventSource.off("keyup", onKeyup);
      machine.reset();
    }
  };
}

module.exports = {
  DEFAULT_VOICE_SETTINGS,
  SUPPORTED_VOICE_KEYS,
  normalizeVoiceKey,
  FRONTMOST_BUNDLE_IDS,
  createFrontmostAppGate,
  createHoldStateMachine,
  isAllowedBundleId,
  observeHold
};
