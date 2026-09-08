"use strict";

// When the companion window is closed (by the OS, a crash of the renderer, or a
// quit-and-recreate), a later recreated window must be able to expand and show a
// teaching again. Left as they were, `isExpanded` would stay true and every future
// showCompanion would be refused by canShowTeaching. Express the reset as a pure
// transition so it can be tested without a BrowserWindow: expansion is cleared and
// any per-card dismiss timer is dropped (the caller clears the actual timer handle).
function resetOnWindowClosed(state = {}) {
  return { ...state, isExpanded: false, dismissTimer: undefined };
}

module.exports = { resetOnWindowClosed };
