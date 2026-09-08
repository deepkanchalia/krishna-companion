"use strict";

// A second launch of the app does not start a new process: it hands its parsed
// config to the already-running instance (Electron's single-instance lock) and
// quits. This decides what that running instance should do with the incoming config,
// as a pure list of actions, so the behaviour can be tested without Electron.
//
// Actions:
//   { type: "set-interval", minutes }        change cadence and persist it
//   { type: "show", verse?, durationSeconds? } show a darshan now (optionally a
//                                              specific verse, optionally auto-closing)
//   { type: "command", name }                forward pause/resume/stop/voice-* etc.
//   { type: "screenshot" }                   capture a preview and quit (dev path)
//
// `config.provided` (from readConfig) says which options the second launch actually
// set, so a plain `krshna now` does not reset a running instance's cadence to the
// default just because config carries the default value.

// The incoming config crosses a process boundary (Electron's additionalData), so it is
// treated as untrusted: only known-good shapes are honoured, everything else is dropped.
const VALID_COMMANDS = new Set(["live", "now", "pause", "resume", "stop", "/krshna"]);
const VERSE_PATTERN = /^\d{1,2}\.\d{1,3}(-\d{1,3})?$/;
const KNOWN_KEYS = new Set(["command", "verse", "intervalMinutes", "durationSeconds", "demo", "screenshot", "provided"]);

// Return a config with only valid fields kept, plus the names of any provided-but-invalid
// fields that were dropped. A command that is present but not on the whitelist is dropped
// and falls back to a safe non-showing default; an absent command keeps the "now" default.
function sanitizeIncoming(config) {
  const rejected = [];
  const raw = (config.provided && typeof config.provided === "object") ? config.provided : {};
  const provided = {};
  const clean = { provided };

  if (config.command === undefined) {
    clean.command = "now";
    provided.command = false;
  } else if (typeof config.command === "string" && VALID_COMMANDS.has(config.command)) {
    clean.command = config.command;
    provided.command = raw.command === true;
  } else {
    rejected.push("command");
    clean.command = "live"; // safe: does not show a darshan on garbage input
    provided.command = false;
  }

  if (raw.verse) {
    if (typeof config.verse === "string" && VERSE_PATTERN.test(config.verse)) {
      clean.verse = config.verse;
      provided.verse = true;
    } else {
      rejected.push("verse");
    }
  }

  if (raw.interval) {
    if (Number.isInteger(config.intervalMinutes) && config.intervalMinutes >= 1 && config.intervalMinutes <= 1440) {
      clean.intervalMinutes = config.intervalMinutes;
      provided.interval = true;
    } else {
      rejected.push("interval");
    }
  }

  if (raw.duration) {
    if (Number.isInteger(config.durationSeconds) && config.durationSeconds >= 0 && config.durationSeconds <= 3600) {
      clean.durationSeconds = config.durationSeconds;
      provided.duration = true;
    } else {
      rejected.push("duration");
    }
  }

  clean.demo = config.demo === true;
  if (config.demo !== undefined && typeof config.demo !== "boolean") rejected.push("demo");
  clean.screenshot = config.screenshot === true;
  if (config.screenshot !== undefined && typeof config.screenshot !== "boolean") rejected.push("screenshot");

  // Any key we do not recognise is dropped and reported, so a forged additionalData
  // cannot smuggle unexpected fields past the validator unnoticed.
  for (const key of Object.keys(config)) {
    if (!KNOWN_KEYS.has(key)) rejected.push(key);
  }

  return { clean, rejected };
}

function planSecondInstance(incoming, currentState = {}) {
  const actions = [];
  if (!incoming || typeof incoming !== "object") return actions;

  const { clean: config, rejected } = sanitizeIncoming(incoming);
  if (rejected.length > 0) {
    process.stderr.write(
      `Krishna Companion ignored invalid second-instance ${rejected.length === 1 ? "field" : "fields"}: ${rejected.join(", ")}\n`
    );
  }
  const provided = config.provided;

  // --interval: change cadence and persist, whatever the command was.
  if (provided.interval && Number.isFinite(config.intervalMinutes)) {
    actions.push({ type: "set-interval", minutes: config.intervalMinutes });
  }

  const command = typeof config.command === "string" ? config.command : "now";
  const hasVerse = Boolean(provided.verse && config.verse);
  // A direct launch shows a darshan for `now` or `--demo`; a bare `--verse` clearly
  // means "show me this verse", so treat that as a show too.
  const wantsShow = command === "now" || config.demo === true || hasVerse;

  if (wantsShow) {
    const show = { type: "show" };
    if (hasVerse) show.verse = config.verse;
    if (provided.duration && Number.isFinite(config.durationSeconds)) {
      show.durationSeconds = config.durationSeconds;
    }
    actions.push(show);
  } else if (provided.command && command) {
    // Forward a command only when the launch actually asked for one. A launch that set
    // only --interval/--verse/--duration carries the DEFAULT command ("live"); forwarding
    // that would silently resume a paused companion, so it must not be forwarded.
    actions.push({ type: "command", name: command });
  }

  if (config.screenshot) actions.push({ type: "screenshot" });

  return actions;
}

module.exports = { planSecondInstance, sanitizeIncoming };
