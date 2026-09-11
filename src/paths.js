// Where the app keeps its data (state.json, journey.json, settings.json). The running app
// uses Electron's userData; this module reconstructs Electron's default location for the
// CLI (bin/krshna.js), which cannot ask Electron, and states the platform rules once. The
// zsh prompt segment (shell/krshna.zsh) mirrors the same rules by hand because a shell
// cannot import this; its case block names this file, and this file names it back.
const path = require("node:path");
const os = require("node:os");

// The per-platform directory name the app stores under. On macOS this is also the name
// Electron's default userData uses (app name "krishna-companion"), so the app and CLI
// agree without the app having to consult Electron's own path.
const APP_DIRECTORY = "krishna-companion";

// Home directory, redirectable via KRSHNA_HOME so the CLI's tests can point every
// home-rooted path at a temp directory. Electron's userData ignores HOME and KRSHNA_HOME,
// so these overrides move only the CLI and the zsh segment, never the app's own state.
function homeDirectory(env = process.env) {
  return env.KRSHNA_HOME || os.homedir();
}

function appDataDirectory({ platform = process.platform, env = process.env } = {}) {
  const home = homeDirectory(env);
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_DIRECTORY);
  }
  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), APP_DIRECTORY);
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), APP_DIRECTORY);
}

module.exports = { APP_DIRECTORY, homeDirectory, appDataDirectory };
