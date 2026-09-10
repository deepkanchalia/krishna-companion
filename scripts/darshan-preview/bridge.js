let showCallback;
let collapseCallback;
let styleCallback;
let currentIndex = 0;
let currentStyle = window.KRISHNA_ANIM_DEFAULT_STYLE || "realistic";
let closeTimer;
function notify(type, fields = {}) { parent.postMessage({ type, ...fields }, location.origin); }
const motionTimings = {
  arrivalMs: previewTimings.ARRIVAL_MS,
  withdrawalMs: previewTimings.WITHDRAWAL_MS,
  breathMs: previewTimings.BREATH_MS,
  settleMs: previewTimings.SETTLE_MS,
  settlePx: previewTimings.SETTLE_PX
};
function show(continuing = false) {
  clearTimeout(closeTimer);
  showCallback({ reflection: previewReflections[currentIndex], durationSeconds: 0, continuing, style: currentStyle, ...motionTimings });
  notify("status", { label: previewReflections[currentIndex].reference });
  closeTimer = setTimeout(withdraw, previewTimings.ARRIVAL_MS + previewTimings.UNTOUCHED_MS);
}
function withdraw() {
  clearTimeout(closeTimer);
  collapseCallback();
  notify("status", { label: "Darshan ended · replay to invite again" });
}
window.krishna = {
  dismiss: withdraw,
  engage: () => {},
  ready: () => {},
  expand: () => clearTimeout(closeTimer),
  next: () => { currentIndex = (currentIndex + 1) % previewReflections.length; show(true); },
  openSource: (url) => {
    if (previewReflections.some((entry) => entry.source === url)) notify("status", { label: url });
  },
  resize: (height) => notify("resize", { height }),
  onShow: (callback) => { showCallback = callback; },
  onCollapse: (callback) => { collapseCallback = callback; },
  onStyle: (callback) => { styleCallback = callback; },
  onListening: () => {}
};
window.addEventListener("message", (event) => {
  if (event.source !== parent || event.origin !== location.origin) return;
  if (event.data.type === "show") {
    const index = previewReflections.findIndex((entry) => `${entry.chapterNumber}.${entry.verse}` === event.data.verse);
    if (index < 0) return;
    currentIndex = index;
    show();
  }
  if (event.data.type === "withdraw") withdraw();
  if (event.data.type === "style" && window.KRISHNA_ANIM_STYLES && window.KRISHNA_ANIM_STYLES[event.data.style]) {
    currentStyle = event.data.style;
    if (styleCallback) styleCallback(currentStyle);
  }
});
window.addEventListener("load", () => notify("ready"));
