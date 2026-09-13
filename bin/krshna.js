#!/usr/bin/env node

// Thin entry point for the `krshna` CLI. The command groups live under src/cli/ (install,
// launch, context, dispatch); this file only resolves projectRoot — the checkout that ran
// the CLI, derived from this file's own location so it is correct even when src/ is a
// symlink — wires it into the dispatcher, and re-exports the functions the tests import.
const path = require("node:path");
const { runNow, runLive } = require("../src/cli/launch");
const { installZsh, uninstallZsh, isKrshnaHook, shQuote, claudeHookCommand } = require("../src/cli/install");
const { reportQuarantinedFiles } = require("../src/cli/context");
const { main } = require("../src/cli/dispatch");

const projectRoot = path.resolve(__dirname, "..");

module.exports = {
  runNow,
  runLive,
  installZsh: () => installZsh(projectRoot),
  uninstallZsh,
  isKrshnaHook,
  reportQuarantinedFiles,
  shQuote,
  claudeHookCommand: () => claudeHookCommand(projectRoot)
};

// Run the CLI only when invoked directly, so tests can import the functions above
// without executing a command.
if (require.main === module) main({ argv: process.argv, projectRoot });
