// Builds the tray context-menu template from the state it needs and the callbacks that
// act on a click. Pure: it takes plain values and returns a Menu.buildFromTemplate array,
// so its shape (labels, the Figure submenu from the style list, which radio is checked)
// can be asserted without Electron. src/main.js wraps the result in Menu.buildFromTemplate
// and owns the rebuild-on-click recursion.
function buildTrayMenuTemplate({
  paused,
  intervalMinutes,
  figureStyle,
  voiceEnabled,
  figureStyles,
  intervals = [30, 60, 90],
  onShowNow,
  onTogglePause,
  onSetInterval,
  onSetStyle,
  onSetVoiceEnabled
}) {
  return [
    { label: "Next teaching now", click: onShowNow },
    { type: "separator" },
    { label: paused ? "Resume teachings" : "Pause teachings", click: onTogglePause },
    {
      label: "Every",
      submenu: intervals.map((minutes) => ({
        label: `${minutes} minutes`,
        type: "radio",
        checked: intervalMinutes === minutes,
        click: () => onSetInterval(minutes)
      }))
    },
    {
      label: "Figure",
      submenu: figureStyles.map((style) => ({
        label: style[0].toUpperCase() + style.slice(1),
        type: "radio",
        checked: figureStyle === style,
        click: () => onSetStyle(style)
      }))
    },
    {
      label: "Voice (hold Space)",
      type: "checkbox",
      checked: voiceEnabled,
      click: (item) => onSetVoiceEnabled(item.checked)
    },
    { type: "separator" },
    { label: "Quit Krishna Companion", role: "quit" }
  ];
}

module.exports = { buildTrayMenuTemplate };
