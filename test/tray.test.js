const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTrayMenuTemplate } = require("../src/tray");
const { FIGURE_STYLES } = require("../src/config");

function template(overrides = {}) {
  return buildTrayMenuTemplate({
    paused: false,
    intervalMinutes: 30,
    figureStyle: "realistic",
    voiceEnabled: false,
    figureStyles: FIGURE_STYLES,
    onShowNow: () => {},
    onTogglePause: () => {},
    onSetInterval: () => {},
    onSetStyle: () => {},
    onSetVoiceEnabled: () => {},
    ...overrides
  });
}

test("the tray template carries the expected top-level items and reflects state", () => {
  const items = template();
  const labels = items.filter((item) => item.label).map((item) => item.label);
  assert.deepEqual(labels, [
    "Next teaching now", "Pause teachings", "Every", "Figure", "Voice (hold Space)", "Quit Krishna Companion"
  ]);
  assert.equal(template({ paused: true })[2].label, "Resume teachings", "the pause item follows the paused state");
  const voice = items.find((item) => item.label === "Voice (hold Space)");
  assert.equal(voice.type, "checkbox");
  assert.equal(voice.checked, false, "voice checkbox reflects voiceEnabled");
  assert.equal(template({ voiceEnabled: true }).find((i) => i.label === "Voice (hold Space)").checked, true);
});

test("the Figure submenu is one radio item per style, checking the active one", () => {
  const figure = template({ figureStyle: "cartoon" }).find((item) => item.label === "Figure");
  assert.deepEqual(figure.submenu.map((item) => item.label.toLowerCase()), FIGURE_STYLES);
  for (const item of figure.submenu) assert.equal(item.type, "radio");
  const checked = figure.submenu.filter((item) => item.checked).map((item) => item.label.toLowerCase());
  assert.deepEqual(checked, ["cartoon"], "exactly the active style is checked");
});

test("the Every submenu marks the current interval and clicking sets it", () => {
  let chosen;
  const figure = template({ intervalMinutes: 60, onSetInterval: (m) => { chosen = m; } }).find((i) => i.label === "Every");
  const checked = figure.submenu.filter((item) => item.checked).map((item) => item.label);
  assert.deepEqual(checked, ["60 minutes"]);
  figure.submenu.find((item) => item.label === "90 minutes").click();
  assert.equal(chosen, 90, "clicking a preset forwards its minutes");
});

test("clicking a Figure item forwards the style name", () => {
  let picked;
  const figure = template({ onSetStyle: (s) => { picked = s; } }).find((i) => i.label === "Figure");
  figure.submenu.find((item) => item.label.toLowerCase() === "gyan").click();
  assert.equal(picked, "gyan");
});

test("clicking the action items forwards to their callbacks with the right value", () => {
  let shown = 0;
  let toggled = 0;
  let voiceSet;
  const items = template({
    onShowNow: () => { shown += 1; },
    onTogglePause: () => { toggled += 1; },
    onSetVoiceEnabled: (value) => { voiceSet = value; }
  });
  items.find((item) => item.label === "Next teaching now").click();
  assert.equal(shown, 1, "Next teaching now calls onShowNow");
  items.find((item) => item.label === "Pause teachings").click();
  assert.equal(toggled, 1, "the pause item calls onTogglePause");
  // The Voice checkbox click receives the Electron menu item, whose `checked` is the new state.
  const voice = items.find((item) => item.label === "Voice (hold Space)");
  voice.click({ checked: true });
  assert.equal(voiceSet, true, "the Voice checkbox forwards the item's checked state");
  voice.click({ checked: false });
  assert.equal(voiceSet, false, "toggling off forwards false");
});
