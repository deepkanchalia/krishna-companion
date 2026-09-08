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
function planSecondInstance(config, currentState = {}) {
  const actions = [];
  if (!config || typeof config !== "object") return actions;
  const provided = config.provided || {};

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

module.exports = { planSecondInstance };
