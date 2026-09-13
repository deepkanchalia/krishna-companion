"use strict";

// Read-only reporting commands: `krshna status` (from state.json) and `krshna context`
// (from journey.json). Both read the data files directly and never spawn the app. Kept out
// of the entry point so the reading and fail-closed rules can be unit-tested without Electron.
const fs = require("node:fs");
const { reflections } = require("../content");
const { isValidHistoryEntry } = require("../journey");
const { safeVerseIndex } = require("../schema");
const { appDataDirectory } = require("../paths");
const { stateFile, journeyFile } = require("./data-files");

function readState() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (!state.live || !state.pid) return { live: false };
  } catch {
    return { live: false };
  }

  try {
    process.kill(state.pid, 0);
  } catch (error) {
    // Managed terminals can deny process inspection even when the app is live.
    if (error.code !== "EPERM") return { live: false };
  }
  return state;
}

function timeUntil(timestamp) {
  if (!timestamp) return "soon";
  const minutes = Math.max(0, Math.ceil((timestamp - Date.now()) / 60000));
  return minutes < 1 ? "<1m" : `${minutes}m`;
}

function printStatus() {
  const state = readState();
  if (!state.live) {
    console.log("Kṛṣṇa Companion is not running. Start it with: krshna");
    return;
  }

  console.log(`Kṛṣṇa Companion is live (PID ${state.pid}).`);
  console.log(state.paused
    ? "Teachings are paused."
    : `Next teaching in ${timeUntil(state.nextReflectionAt)}; cadence ${state.intervalMinutes} minutes.`);
  if (state.nextReference) console.log(`Next in sequence: ${state.nextReference}.`);
}

// One line if the app moved any damaged data file aside (store.js quarantine). The names are
// our own <name>.corrupt-<timestamp>.json files, matched strictly, so a hostile filename
// dropped in the data directory can never be echoed to the terminal.
function reportQuarantinedFiles() {
  let entries;
  try {
    entries = fs.readdirSync(appDataDirectory());
  } catch {
    return;
  }
  const CORRUPT_NAME = /^(state|journey|settings)\.corrupt-[0-9TZ-]+(-\d+)?(\.\d+)?\.json$/;
  const corrupt = entries.filter((name) => CORRUPT_NAME.test(name)).sort();
  if (corrupt.length === 0) return;
  const noun = corrupt.length === 1 ? "file was" : "files were";
  console.log(`Note: ${corrupt.length} damaged data ${noun} kept aside (${corrupt.join(", ")}).`);
}

function printContext() {
  reportQuarantinedFiles();
  let savedJourney;
  try {
    savedJourney = JSON.parse(fs.readFileSync(journeyFile(), "utf8"));
  } catch {
    console.log("No teaching has been shown yet. The journey will begin with Bhagavad-gītā As It Is 1.1.");
    return;
  }

  // Fail closed on a parseable-but-wrong-shape journey.json (a literal `null`, an array, a
  // scalar from a hand edit): `savedJourney?.history` never throws, and a non-array history
  // becomes empty, so `krshna context` reports "no teaching yet" rather than crashing.
  const history = Array.isArray(savedJourney?.history) ? savedJourney.history : [];
  // C3: journey.json can be edited by hand, so nothing stored in it reaches the terminal. An
  // entry counts as readable only when its reference names a verse in the corpus, and the
  // lines printed below are the corpus's own text, never the strings the file carries.
  const byReference = new Map(reflections.map((reflection) => [reflection.reference, reflection]));
  const readable = history.filter((entry) => isValidHistoryEntry(entry) && byReference.has(entry.reference));
  const unreadable = history.length - readable.length;
  if (unreadable > 0) {
    console.log(`Note: journey has ${unreadable} unreadable ${unreadable === 1 ? "entry" : "entries"}; skipping.`);
  }

  const last = readable.at(-1);
  if (!last) {
    console.log("No teaching has been shown yet. The journey will begin with Bhagavad-gītā As It Is 1.1.");
    return;
  }
  const verse = byReference.get(last.reference);
  console.log(`Last explained: ${verse.reference}`);
  console.log((verse.meaning || verse.translation).replace("\n", " "));
  const nextIndex = safeVerseIndex(savedJourney?.nextVerseIndex, undefined);
  console.log(`Next in sequence: ${reflections[nextIndex]?.reference || "the opening verse"}.`);
}

module.exports = { readState, timeUntil, printStatus, reportQuarantinedFiles, printContext };
