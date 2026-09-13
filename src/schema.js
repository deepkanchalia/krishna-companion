"use strict";

// The fail-closed validators for the three persisted files (state.json, journey.json,
// settings.json). settings.json and state.json sit in the user's data directory and can
// be hand-edited, so every field is checked against an allow-list, a range, or an exact
// type before it can reach a display sink, the key hook, or the corpus index (C3, C7).
// Consolidated here so main.js and the CLI validate by the same rules instead of each
// carrying its own copy. Pure: no Electron, no I/O.

const { isPlainObject } = require("./sanitize");
const { INTERVAL_MINUTES_MIN, INTERVAL_MINUTES_MAX, normalizeFigureStyle } = require("./config");
const { DEFAULT_VOICE_SETTINGS, normalizeVoiceKey } = require("./voice-hold");

// Below the floor a voice hold is too twitchy to be deliberate; above the ceiling it is a
// press no reader performs. A value outside [MIN, MAX] fails closed to the default hold.
const MIN_HOLD_MS = 250;
const MAX_HOLD_MS = 10_000;

// A saved boolean flag (voice enabled, paused) is honoured ONLY for the literal `true`.
// A string "true", 1, {} — any other shape from a hand edit — reads as false, so a
// wrong-typed value can never silently arm the key hook or forget a pause (C7).
function isTrueFlag(value) {
  return value === true;
}

// A finite integer verse index, else the fallback (0 when none is given, so main.js can
// call it bare; the CLI passes `undefined` to keep its "the opening verse" wording). Guards
// the corpus index against a NaN or float from a hand-edited state.json/journey.json.
function safeVerseIndex(value, fallback) {
  if (Number.isInteger(value)) return value;
  return arguments.length > 1 ? fallback : 0;
}

// The cadence interval, restored across restarts, clamped to the same [MIN, MAX] readConfig
// uses. A missing or out-of-range value fails closed to the fallback (the running default).
function boundedInterval(value, fallback) {
  return Number.isFinite(value) && value >= INTERVAL_MINUTES_MIN && value <= INTERVAL_MINUTES_MAX
    ? value
    : fallback;
}

function boundedHoldMs(value, fallback = DEFAULT_VOICE_SETTINGS.holdMs) {
  return Number.isFinite(value) && value >= MIN_HOLD_MS && value <= MAX_HOLD_MS ? value : fallback;
}

// A saved resting position is used only when both coordinates are finite numbers; anything
// else leaves the caller's current position untouched.
function validRestingPosition(savedSettings) {
  const safe = isPlainObject(savedSettings) ? savedSettings : {};
  const position = safe.restingPosition;
  return position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : undefined;
}

// Build the settings object the app runs on from raw settings.json. Every voice field is
// re-validated: enabled only for a literal true (C7), the key against the fixed allow-list
// (C3), holdMs into range, and the figure style against the fixed list (C3). A wrong-shape
// file (null, array, scalar) is treated as absent.
function normalizeSettings(savedSettings) {
  const safeSettings = isPlainObject(savedSettings) ? savedSettings : {};
  const savedVoice = isPlainObject(safeSettings.voice) ? safeSettings.voice : {};
  const settings = {
    ...safeSettings,
    version: 1,
    voice: { ...DEFAULT_VOICE_SETTINGS, ...savedVoice }
  };
  settings.figure = { style: normalizeFigureStyle(safeSettings.figure?.style) };
  settings.voice.enabled = isTrueFlag(savedVoice.enabled);
  settings.voice.key = normalizeVoiceKey(settings.voice.key);
  settings.voice.holdMs = boundedHoldMs(settings.voice.holdMs);
  return settings;
}

module.exports = {
  MIN_HOLD_MS,
  MAX_HOLD_MS,
  isTrueFlag,
  safeVerseIndex,
  boundedInterval,
  boundedHoldMs,
  validRestingPosition,
  normalizeSettings
};
