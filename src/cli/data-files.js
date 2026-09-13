"use strict";

// The two runtime data files the CLI reads (state.json for `status`, journey.json for
// `context`). appDataDirectory (src/paths.js) is the single source shared with the app,
// redirectable via KRSHNA_HOME so the CLI's tests point every path at a temp directory.
const path = require("node:path");
const { appDataDirectory } = require("../paths");

function stateFile() {
  return path.join(appDataDirectory(), "state.json");
}

function journeyFile() {
  return path.join(appDataDirectory(), "journey.json");
}

module.exports = { stateFile, journeyFile };
