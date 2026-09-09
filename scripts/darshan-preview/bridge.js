let showCallback;
let collapseCallback;
let currentIndex = 0;
let closeTimer;
let reviewTimer;
function notify(type, fields = {}) { parent.postMessage({ type, ...fields }, location.origin); }
function show(continuing = false) {
  clearTimeout(reviewTimer);
  clearTimeout(closeTimer);
  showCallback({ reflection: previewReflections[currentIndex], durationSeconds: 0, continuing });
  notify("status", { label: previewReflections[currentIndex].reference });
  closeTimer = setTimeout(withdraw, 180_000 + window.KrishnaMotion.ARRIVAL_MS);
}
function withdraw() {
  clearTimeout(reviewTimer);
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
  if (event.data.type === "motion" && ["teach", "explain", "listen", "idle"].includes(event.data.action)) {
    clearTimeout(closeTimer);
    window.krishnaCharacter.play(event.data.action);
  }
  if (event.data.type === "review" && window.KrishnaMotion.ACTIONS.includes(event.data.action) && Number.isFinite(event.data.elapsed) && [0, .25, 1].includes(event.data.speed)) {
    clearTimeout(closeTimer); clearTimeout(reviewTimer);
    // Let the real renderer cancel an in-flight entrance before entering review.
    showCallback({ reflection: previewReflections[currentIndex], durationSeconds: 0, continuing: true });
    reviewTimer = setTimeout(() => {
      window.krishnaCharacter.reviewPose(event.data.action, event.data.elapsed, event.data.speed);
      notify("status", { label: `Motion review · ${event.data.action} · ${event.data.elapsed} ms · ${event.data.speed || "paused"}` });
    }, 350);
  }
});
window.addEventListener("load", () => notify("ready"));
