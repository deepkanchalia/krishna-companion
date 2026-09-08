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
const { safeLabel } = require("./sanitize");

// Strip control characters from a path/message before echoing it on one stderr line,
// without truncating an ordinary path.
const echo = (value) => safeLabel(value, 256);

// Files this session must not overwrite: when a corrupt file could not be moved aside
// (a read-only directory, say), we keep its bytes intact by refusing every later save
// to that path, so the user's data is never lost to a defaulted write.
const readOnlyThisSession = new Set();

// Where a damaged <name>.json is moved to: <name>.corrupt-<ISO timestamp>.json,
// next to the original. Colons and dots in the ISO string are replaced so the name
// is legal on Windows too. If that name is somehow already taken (two failures in
// the same millisecond), a short counter keeps it distinct.
function quarantineTarget(filePath) {
  const directory = path.dirname(filePath);
  const base = path.basename(filePath).replace(/\.json$/i, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Include the pid so two processes quarantining the same file in the same millisecond
  // cannot pick the same target; a counter breaks any residual tie within one process.
  const prefix = `${base}.corrupt-${stamp}-${process.pid}`;
  let candidate = path.join(directory, `${prefix}.json`);
  let counter = 1;
  while (existsSync(candidate)) {
    candidate = path.join(directory, `${prefix}-${counter}.json`);
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
      // The bad file could not be moved aside. Do NOT hand back a writable fallback that
      // a later save would flush over the original: mark the path read-only for this
      // session, keep its bytes, and record it (quarantinedTo: null) for the startup notice.
      readOnlyThisSession.add(filePath);
      if (Array.isArray(quarantined)) quarantined.push({ file: filePath, quarantinedTo: null });
      process.stderr.write(`krishna-companion: could not quarantine ${echo(filePath)} (${echo(error.message)}); keeping it read-only this session\n`);
    }
    return fallback;
  }
}

// Write JSON atomically (temp file + rename). Any write or rename failure is logged
// on one stderr line and swallowed: a save must never throw out of the app. Returns
// true on success, false on failure.
function writeJson(filePath, value) {
  if (readOnlyThisSession.has(filePath)) {
    process.stderr.write(`krishna-companion: refusing to overwrite ${echo(filePath)}: kept read-only after a failed repair\n`);
    return false;
  }
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(temporaryPath, filePath);
    return true;
  } catch (error) {
    process.stderr.write(`krishna-companion: could not save ${echo(filePath)}: ${echo(error.message)}\n`);
    return false;
  }
}

module.exports = { readJson, writeJson, quarantineTarget };
