// Single source for where the app keeps its data (state.json, journey.json,
// settings.json). The running app (src/main.js) and the CLI (bin/krshna.js) both resolve
// through here so their idea of the directory cannot drift; the zsh prompt segment
// (shell/krshna.zsh) reconstructs the same path by hand because a shell cannot import this
// — its case block names this file as the source of truth, and this file names it back.
const path = require("node:path");
const os = require("node:os");

// The per-platform directory name the app stores under. On macOS this is also the name
// Electron's default userData uses (app name "krishna-companion"), so the app and CLI
// agree without the app having to consult Electron's own path.
const APP_DIRECTORY = "krishna-companion";

// Home directory, redirectable via KRSHNA_HOME so the CLI's tests can point every
// home-rooted path at a temp directory. os.homedir() (and Electron's userData) ignore
// $HOME on macOS, so KRSHNA_HOME is the one lever that moves these paths.
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
