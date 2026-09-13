"use strict";

// Pure, Electron-free cadence reconciliation.
//
// The scheduler in main.js was a bare setInterval: it fired blindly, forgot pause and the
// cadence interval across a restart, and had no model for what happens when the machine
// sleeps for hours (Node's timers are suspended during system sleep, so on wake the
// interval is far behind the wall clock). This module holds the decision so a fake clock
// can drive it in tests, while main.js owns the real timer, the real Date.now(), and the
// powerMonitor wake events that call in here.
//
// reconcileCadence({ now, nextReflectionAt, intervalMs, paused, isExpanded }) returns
// { due, nextReflectionAt }:
//
//   - now < nextReflectionAt           -> { due: false, nextReflectionAt } (unchanged)
//   - now >= nextReflectionAt, clear   -> { due: true,  nextReflectionAt: now + intervalMs }
//   - now >= nextReflectionAt, blocked -> { due: false, nextReflectionAt } (held, not dropped)
//
// where "clear" means not paused with no teaching open, and "blocked" means paused or a
// teaching is open.
//
// Missed-time policy (the point of this module): however long the machine slept, or however
// many interval boundaries elapsed while paused or while a card was open, this fires AT MOST
// ONCE and advances the schedule ONE interval from `now`, never a catch-up storm of N
// darshans for N missed intervals. A reader away for three hours on a 30-minute cadence gets
// one teaching on return, not six stacked cards.
//
// Blocked-but-due policy: when a boundary passes while paused or expanded we do NOT drop the
// schedule and do NOT fire behind the reader's back. nextReflectionAt is left in the past so
// the FIRST reconcile after the block clears (the next interval tick, or a resume/unlock
// wake) sees now >= nextReflectionAt with a clear state and fires exactly once. main.js
// never arms a zero-delay timer off this state — it ticks on a fixed interval and reconciles
// on wake — so a held past-due time cannot spin.
function reconcileCadence({ now, nextReflectionAt, intervalMs, paused = false, isExpanded = false }) {
  // No usable schedule yet (first arm, or a corrupt/missing persisted value): arm one
  // interval ahead of now without firing.
  if (!Number.isFinite(nextReflectionAt)) {
    return { due: false, nextReflectionAt: now + intervalMs };
  }
  // Not time yet: leave the schedule exactly where it is.
  if (now < nextReflectionAt) {
    return { due: false, nextReflectionAt };
  }
  // Past due but blocked: hold the time so it fires once when the block clears.
  if (paused || isExpanded) {
    return { due: false, nextReflectionAt };
  }
  // Due: fire once, advance a single interval from now (not from the missed boundary).
  return { due: true, nextReflectionAt: now + intervalMs };
}

module.exports = { reconcileCadence };
