// Encounter timers are Electron-free so tests never launch the real companion.
// This module is the single source for every darshan timing: main.js sends them in
// the companion:show payload, the renderer turns them into CSS custom properties,
// and the localhost preview bridge reads them too. No duration is written twice.
const ARRIVAL_MS = 1_100;
const WITHDRAWAL_MS = 900;
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
