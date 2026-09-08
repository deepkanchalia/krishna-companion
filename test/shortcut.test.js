const test = require("node:test");
const assert = require("node:assert/strict");
const { shortcutUnavailableMessage } = require("../src/shortcut");

test("the unavailable-shortcut message names the key and says the app keeps running", () => {
  const message = shortcutUnavailableMessage("CommandOrControl+Alt+K");
  assert.match(message, /CommandOrControl\+Alt\+K/, "names the exact key combination");
  assert.match(message, /unavailable/i);
  assert.match(message, /still running/i, "reassures the reader the app keeps running");
});
