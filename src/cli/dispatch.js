"use strict";

// Argument parsing and command dispatch for the `krshna` CLI. Wires the command groups
// (install, launch, context) into the single switch the entry point calls. projectRoot is
// passed down to the launcher and installer so their paths point at the checkout that ran
// the CLI, not at wherever this module resolves through a symlink.
const { FIGURE_STYLES } = require("../config");
const { launch, runNow, runLive } = require("./launch");
const { install, uninstall } = require("./install");
const { readState, printStatus, printContext } = require("./context");

// `krshna voice on|off` and `krshna style <name>` fold into the single-word commands the app
// accepts (voice-on, style-cartoon); the style name is validated against FIGURE_STYLES, the
// one list shared with the app.
function parseCommand(argv) {
  const rawCommand = (argv[2] || "live").toLowerCase();
  const voiceAction = (argv[3] || "").toLowerCase();
  const command = rawCommand === "voice" ? `voice-${voiceAction}`
    : rawCommand === "style" ? `style-${voiceAction}`
      : rawCommand.replace(/^\//, "");
  return { command, rawCommand };
}

function help() {
  console.log(`
Krishna Companion

  krshna             Make the companion live
  krshna start       Alias of krshna (make the companion live)
  krshna now         Invite a teaching now
  krshna pause       Pause scheduled teachings
  krshna resume      Resume the companion
  krshna status      Show its current state
  krshna context     Recall the last teaching and next verse
  krshna voice on    Enable hold-Space voice
  krshna voice off   Disable hold-Space voice
  krshna style <name>  Figure style: ${FIGURE_STYLES.join(" | ")}
  krshna stop        Stop the companion
  krshna install     Add /krshna, terminal status, and the Claude Code voice hook
  krshna uninstall   Remove the zsh integration and the Claude Code voice hook
`);
}

function main({ argv = process.argv, projectRoot } = {}) {
  const { command, rawCommand } = parseCommand(argv);
  const boundLaunch = (nextCommand) => launch(projectRoot, nextCommand);

  // `krshna style <name>`: the name must be one of FIGURE_STYLES (the app's own list);
  // a valid one is forwarded to the running companion like any other command.
  if (command.startsWith("style-") && command !== "style-") {
    const styleName = command.slice("style-".length);
    if (!FIGURE_STYLES.includes(styleName)) {
      console.error(`Unknown figure style: ${styleName}. Use: krshna style ${FIGURE_STYLES.join("|")}`);
      process.exitCode = 1;
      return;
    }
    if (!readState().live) {
      console.log("Kṛṣṇa Companion is not running. Start it with: krshna");
      return;
    }
    boundLaunch(command);
    return;
  }
  switch (command) {
    case "status":
      printStatus();
      break;
    case "context":
      printContext();
      break;
    case "install":
      install(projectRoot);
      break;
    case "uninstall":
      uninstall();
      break;
    case "help":
    case "--help":
    case "-h":
      help();
      break;
    case "now":
      // Launch or forward, then wait for the companion to stamp state.json before returning,
      // so the Claude Code hook knows the invocation was received.
      process.exitCode = runNow({ launch: boundLaunch });
      break;
    case "live":
    case "start":
      process.exitCode = runLive(command, { launch: boundLaunch });
      break;
    case "pause":
    case "resume":
    case "voice-on":
    case "voice-off":
    case "stop":
      if (!readState().live) {
        console.log("Kṛṣṇa Companion is not running. Start it with: krshna");
        break;
      }
      boundLaunch(command);
      break;
    case "voice-":
      console.error("Usage: krshna voice on|off");
      process.exitCode = 1;
      break;
    case "style-":
      console.error(`Usage: krshna style ${FIGURE_STYLES.join("|")}`);
      process.exitCode = 1;
      break;
    default:
      console.error(`Unknown command: ${rawCommand}`);
      help();
      process.exitCode = 1;
  }
}

module.exports = { parseCommand, help, main };
