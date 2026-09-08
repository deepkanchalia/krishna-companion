"use strict";

// The message shown when the global shortcut cannot be registered (another app
// already owns it). Kept pure and separate so its exact wording — including the key
// combination — is testable without Electron. globalShortcut.register returns false
// in this case; main.js logs this line and shows it once as a notification.
function shortcutUnavailableMessage(shortcut) {
  return `The ${shortcut} shortcut is unavailable; another app may already use it. Krishna Companion is still running.`;
}

module.exports = { shortcutUnavailableMessage };
