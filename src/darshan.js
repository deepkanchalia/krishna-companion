// Encounter timers are Electron-free so tests never launch the real companion.
// This module is the single source for the figure timings: main.js sends them in
// the companion:show payload, the renderer turns them into CSS custom properties,
// and the localhost preview bridge reads them too. ARRIVAL_MS and WITHDRAWAL_MS are
// upper bounds for the walk-in (25 frames at 12 fps = 2083 ms) and farewell (46 at
// 12 fps = 3833 ms) sprite segments in assets/anim/manifest.js, rounded up to leave
// room for sheet decoding; the CSS slide uses the same values as its fallback.
const ARRIVAL_MS = 2_200;
const WITHDRAWAL_MS = 4_000;
const UNTOUCHED_MS = 180_000;
// Micro-motion (M1.6/UI5): breathing period, and the one-shot arrival settle bob.
const BREATH_MS = 4_000;
const SETTLE_MS = 400;
const SETTLE_PX = 6;

function createDarshan({ onWithdraw, onAbsent, schedule = setTimeout, cancel = clearTimeout }) {
  let phase = "absent";
  let timer;
  function clear() {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function withdraw() {
    if (phase === "absent" || phase === "withdrawing") return false;
    clear();
    phase = "withdrawing";
    onWithdraw();
    timer = schedule(() => {
      timer = undefined;
      phase = "absent";
      onAbsent();
    }, WITHDRAWAL_MS);
    return true;
  }
  return {
    get phase() { return phase; },
    show(durationSeconds = 0) {
      if (phase === "withdrawing") return false;
      clear();
      phase = "present";
      timer = schedule(withdraw, ARRIVAL_MS + (durationSeconds > 0 ? durationSeconds * 1000 : UNTOUCHED_MS));
      return true;
    },
    expand() {
      if (phase !== "present") return false;
      clear();
      return true;
    },
    withdraw,
    reset() { clear(); phase = "absent"; }
  };
}

module.exports = { createDarshan, ARRIVAL_MS, WITHDRAWAL_MS, UNTOUCHED_MS, BREATH_MS, SETTLE_MS, SETTLE_PX };
