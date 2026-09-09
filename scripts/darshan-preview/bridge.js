let showCallback;
let collapseCallback;
let currentIndex = 0;
let closeTimer;
function notify(type, fields = {}) { parent.postMessage({ type, ...fields }, location.origin); }
function show(continuing = false) {
  clearTimeout(closeTimer);
  showCallback({ reflection: previewReflections[currentIndex], durationSeconds: 0, continuing });
  notify("status", { label: previewReflections[currentIndex].reference });
  closeTimer = setTimeout(withdraw, 181_100);
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
});
window.addEventListener("load", () => notify("ready"));
