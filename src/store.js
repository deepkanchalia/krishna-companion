"use strict";

// Reading and writing the app's small JSON files (state.json, journey.json,
// settings.json). A file that is present but not valid JSON is *quarantined*, never
// silently replaced with defaults: the bad file is renamed aside so the reader can
// recover it, the fallback is returned, and the event is recorded so the caller can
// tell the user once. Extracted from src/main.js so it can be unit-tested without
// Electron, and reused by the CLI (bin/krshna.js).

const path = require("node:path");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} = require("node:fs");

// Where a damaged <name>.json is moved to: <name>.corrupt-<ISO timestamp>.json,
// next to the original. Colons and dots in the ISO string are replaced so the name
// is legal on Windows too. If that name is somehow already taken (two failures in
// the same millisecond), a short counter keeps it distinct.
function quarantineTarget(filePath) {
  const directory = path.dirname(filePath);
  const base = path.basename(filePath).replace(/\.json$/i, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let candidate = path.join(directory, `${base}.corrupt-${stamp}.json`);
  let counter = 1;
  while (existsSync(candidate)) {
    candidate = path.join(directory, `${base}.corrupt-${stamp}-${counter}.json`);
    counter += 1;
  }
  return candidate;
}

// Read and parse JSON. A missing file returns the fallback with no quarantine. A
// file that fails to parse is renamed aside (never deleted), the fallback is
// returned, and { file, quarantinedTo } is pushed onto `quarantined`. A file that
// cannot even be read (permissions, a directory) returns the fallback without a
// quarantine, since we cannot safely move what we cannot read.
function readJson(filePath, fallback, quarantined) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const quarantinedTo = quarantineTarget(filePath);
    try {
      renameSync(filePath, quarantinedTo);
      if (Array.isArray(quarantined)) quarantined.push({ file: filePath, quarantinedTo });
    } catch (error) {
      process.stderr.write(`krishna-companion: could not quarantine ${filePath}: ${error.message}\n`);
    }
    return fallback;
  }
}

// Write JSON atomically (temp file + rename). Any write or rename failure is logged
// on one stderr line and swallowed: a save must never throw out of the app. Returns
// true on success, false on failure.
function writeJson(filePath, value) {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(temporaryPath, filePath);
    return true;
  } catch (error) {
    process.stderr.write(`krishna-companion: could not save ${filePath}: ${error.message}\n`);
    return false;
  }
}

module.exports = { readJson, writeJson, quarantineTarget };
