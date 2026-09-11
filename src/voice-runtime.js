// Voice runtime: the on-device speech helper's spawn, the listen session lifecycle, and
// the trigger-key hook that starts a listen. It owns all the voice state (the native hook,
// the current listen session, the once-per-launch disabled flag) so src/main.js does not.
// Everything it touches outside this file — the helper spawn, the platform, the settings,
// the "listening" feedback, the once-per-launch notice, and what a recognised invocation
// does — is injected, so the transcript hand-off can be tested without Electron, a real
// helper, or the native key hook.
function createVoiceRuntime({
  platform,
  spawn,
  systemPreferences,
  existsSync,
  helperPath,
  helperBuildPath,
  projectRoot,
  listenTimeoutMs,
  loadHook,
  observeHold,
  createFrontmostAppGate,
  containsInvocation,
  getVoiceSettings,
  isExpanded,
  setListening,
  notify,
  onMatch,
  logError = (message) => console.error(message)
}) {
  let voiceHook;
  let voiceObserver;
  let listeningSession;
  let voiceDisabledForLaunch = false;
  let helperBuildStarted = false;

  function stopListening(session = listeningSession, { kill = true } = {}) {
    if (!session || session !== listeningSession) return;
    listeningSession = undefined;
    clearTimeout(session.timeout);
    setListening(false);
    if (kill && session.child.exitCode === null && session.child.signalCode === null) {
      session.child.kill();
    }
  }

  function stop() {
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

  function disableForLaunch(message, { log = false } = {}) {
    if (voiceDisabledForLaunch) return;
    voiceDisabledForLaunch = true;
    stop();
    if (log) logError(message);
    notify(message);
  }

  function startListening() {
    const voice = getVoiceSettings();
    if (listeningSession || isExpanded() || voiceDisabledForLaunch || !voice.enabled) return false;

    // This presents macOS's Accessibility prompt; uiohook itself presents Input Monitoring when needed.
    try {
      systemPreferences.isTrustedAccessibilityClient(true);
    } catch {
      // Input Monitoring may already be sufficient for this hook.
    }

    // A missing helper surfaces as an asynchronous "error" event (handled below), but a
    // helper that is present and not executable for this machine (ENOEXEC, a wrong
    // architecture) makes spawn throw synchronously; that must disable voice for the launch
    // too, or every completed hold would rethrow and re-raise the Accessibility prompt.
    let child;
    try {
      child = spawn(helperPath, [`--timeout=${listenTimeoutMs}`], {
        stdio: ["pipe", "pipe", "ignore"]
      });
    } catch {
      disableForLaunch("Krishna Companion voice is unavailable for this launch.", { log: true });
      return false;
    }

    const session = { child, buffer: "", timeout: undefined };
    listeningSession = session;
    setListening(true);
    session.timeout = setTimeout(() => stopListening(session), listenTimeoutMs);

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
          onMatch();
          return;
        }
        newline = session.buffer.indexOf("\n");
      }
    });

    child.once("error", () => {
      if (listeningSession !== session) return;
      stopListening(session, { kill: false });
      disableForLaunch("Krishna Companion voice is unavailable for this launch.", { log: true });
    });
    child.once("close", (code) => {
      if (listeningSession === session) stopListening(session, { kill: false });
      if ([2, 3, 4].includes(code)) {
        disableForLaunch(
          "Allow Microphone and Speech Recognition for Krishna Companion in System Settings"
        );
      }
    });
    return true;
  }

  function startHook() {
    const voice = getVoiceSettings();
    if (platform !== "darwin" || voiceHook || voiceDisabledForLaunch || !voice.enabled) return;

    let nativeHook;
    let keyCodes;
    try {
      ({ uIOhook: nativeHook, UiohookKey: keyCodes } = loadHook());
    } catch {
      disableForLaunch("Krishna Companion voice unavailable: global key hook could not load.", { log: true });
      return;
    }

    // voice.key was validated against the allow-list at load, so it is a known token here;
    // the notice never interpolates an arbitrary settings string (C3).
    const triggerKey = keyCodes[voice.key];
    if (!Number.isInteger(triggerKey)) {
      disableForLaunch("Krishna Companion voice unavailable: unsupported trigger key.", { log: true });
      return;
    }

    voiceHook = nativeHook;
    voiceObserver = observeHold({
      eventSource: nativeHook,
      triggerKey,
      holdMs: voice.holdMs,
      isFrontmostAllowed: createFrontmostAppGate(),
      onTrigger: startListening,
      onRelease: () => stopListening()
    });

    try {
      nativeHook.start();
    } catch {
      disableForLaunch("Krishna Companion voice unavailable: global key hook could not start.", { log: true });
    }
  }

  function initialize() {
    const voice = getVoiceSettings();
    if (platform !== "darwin" || !voice.enabled || voiceDisabledForLaunch) return;
    if (existsSync(helperPath)) {
      startHook();
      return;
    }
    if (helperBuildStarted) return;
    helperBuildStarted = true;

    const build = spawn("/bin/bash", [helperBuildPath], {
      cwd: projectRoot,
      stdio: "ignore"
    });
    build.once("error", () => {
      disableForLaunch("Krishna Companion voice unavailable: Xcode Command Line Tools are required.", { log: true });
    });
    build.once("close", (code) => {
      if (code === 0 && existsSync(helperPath)) startHook();
      else disableForLaunch(
        "Krishna Companion voice unavailable: Xcode Command Line Tools are required.",
        { log: true }
      );
    });
  }

  return { initialize, startListening, stopListening, stop };
}

module.exports = { createVoiceRuntime };
