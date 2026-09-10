const cardElement = document.querySelector(".card");
const translationElement = document.querySelector("#translation");
const meaningElement = document.querySelector("#meaning");
const sourceElement = document.querySelector("#source");
const expandElement = document.querySelector("#expand");
const nextElement = document.querySelector("#next");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const rootStyle = document.documentElement.style;
let currentSource;
let reflection;
let revealTimer;
let arrivalDelay = 0;
let continuingDelay = 0;
let phase = "absent";
let expanded = false;
let continuingVerse = false;

// Sprite flipbook (src/sprite-player.js + assets/anim/manifest.js). Optional: when the
// manifest or the player is missing the CSS slide and the still image are used instead.
const spriteCanvas = document.querySelector(".sprite");
const animManifest = window.KRISHNA_ANIM;
const Sprite = window.KrishnaSprite;
const spriteReady = Boolean(spriteCanvas && animManifest && Sprite && Sprite.validateManifest(animManifest).length === 0);
let player = null;

function initSprite() {
  if (!spriteReady) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = spriteCanvas.getBoundingClientRect ? spriteCanvas.getBoundingClientRect() : { width: 220, height: 286 };
  spriteCanvas.width = Math.round((rect.width || 220) * ratio);
  spriteCanvas.height = Math.round((rect.height || 286) * ratio);
  player = Sprite.createSpritePlayer(animManifest, {
    canvas: spriteCanvas,
    loadImage: (file) => { const img = new Image(); img.decoding = "async"; img.src = `../assets/anim/${file}`; return img; },
    raf: (fn) => window.requestAnimationFrame(fn),
    caf: (id) => window.cancelAnimationFrame(id),
    now: () => performance.now()
  });
  document.body.classList.add("sprite");
}

// Keep the flipbook in step with the darshan phase. Absent: nothing drawn, no frame
// loop. Hidden tab or reduced motion: one still frame, no loop.
function syncSprite() {
  if (!player) return;
  if (phase === "absent") { player.clear(); return; }
  if (document.hidden || reducedMotion.matches) { player.still("idle", 0); return; }
  const segment = Sprite.segmentForPhase(phase, { continuing: continuingVerse });
  if (!segment) { player.clear(); return; }
  if (player.current() === segment) return;
  player.play(segment, onSegmentEnd);
}

function onSegmentEnd(name) {
  if (!player) return;
  if (name === "farewell") { player.clear(); return; }
  const next = Sprite.nextAfter(name);
  if (next && (phase === "present" || phase === "arriving")) player.play(next, onSegmentEnd);
}

function playGesture() {
  if (!player || phase !== "present" || document.hidden || reducedMotion.matches) return;
  player.play(Sprite.EXPAND_GESTURE, onSegmentEnd);
}

// The card sits CARD_INSET px inside the window on each side; the renderer asks the
// main process for a window tall enough to hold the card plus that inset.
const CARD_INSET = 32;

function fitWindowToCard() {
  window.krishna.resize(cardElement.scrollHeight + CARD_INSET);
}

// Turn the timings from the companion:show payload (src/darshan.js) into the CSS
// custom properties styles.css reads. This is the only place durations enter the DOM.
function applyMotionTimings({ arrivalMs, withdrawalMs, breathMs, settleMs, settlePx }) {
  if (Number.isFinite(arrivalMs)) rootStyle.setProperty("--arrival", `${arrivalMs}ms`);
  if (Number.isFinite(withdrawalMs)) rootStyle.setProperty("--withdraw", `${withdrawalMs}ms`);
  if (Number.isFinite(breathMs)) rootStyle.setProperty("--breath", `${breathMs}ms`);
  if (Number.isFinite(settleMs)) rootStyle.setProperty("--settle", `${settleMs}ms`);
  if (Number.isFinite(settlePx)) rootStyle.setProperty("--settle-px", `${settlePx}px`);
  // A continuing verse keeps the figure present, so its reveal only waits out the settle.
  arrivalDelay = Number.isFinite(arrivalMs) ? arrivalMs : 0;
  continuingDelay = Number.isFinite(settleMs) ? settleMs : 0;
}

function revealMessage() {
  clearTimeout(revealTimer);
  if (phase !== "arriving") return;
  phase = "present";
  document.body.dataset.phase = phase;
  syncSprite();
  document.querySelector("#messages").setAttribute("aria-busy", "false");
  nextElement.disabled = false;
  window.krishna.ready();
  fitWindowToCard();
}

function showTeaching({ reflection: incoming, durationSeconds, preview = false, continuing = false, ...timings }) {
  clearTimeout(revealTimer);
  applyMotionTimings(timings);
  reflection = incoming;
  currentSource = reflection.source;
  expanded = false;
  phase = "arriving";
  continuingVerse = continuing;
  cardElement.inert = false;
  document.body.classList.remove("expanded");
  document.body.classList.toggle("continuing", continuing);
  document.body.dataset.phase = phase;
  syncSprite();
  document.querySelector("#messages").setAttribute("aria-busy", "true");
  translationElement.textContent = reflection.translation;
  cardElement.classList.toggle("long", reflection.translation.split(/\s+/).length > 90);
  meaningElement.textContent = reflection.meaning;
  document.querySelector("#purport").hidden = true;
  document.querySelector("#reference").textContent = reflection.reference.replace("Bhagavad-gītā As It Is ", "BG ");
  document.querySelector("#chapter").textContent = reflection.chapter;
  sourceElement.title = reflection.reference;
  expandElement.hidden = false;
  expandElement.setAttribute("aria-expanded", "false");
  expandElement.textContent = reflection.meaning ? "Read full verse & purport" : "Read full verse";
  nextElement.hidden = preview;
  nextElement.disabled = true;
  document.querySelector("#session-note").textContent = preview ? "Verse preview · journey unchanged" : "One verse at a time";
  document.querySelector("#timing-note").textContent = durationSeconds > 0
    ? "Opens longer when you read more" : "A quiet moment · 3 minutes";
  cardElement.scrollTop = 0;
  fitWindowToCard();
  // With sprites the message waits for the walk-in to finish; otherwise the CSS slide.
  const arrival = player && !continuing ? Sprite.durationMs(animManifest.segments.walkin) : arrivalDelay;
  revealTimer = setTimeout(revealMessage, reducedMotion.matches ? 0 : (continuing ? continuingDelay : arrival));
}

function expand() {
  if (phase === "absent" || phase === "withdrawing" || expanded) return;
  revealMessage();
  expanded = true;
  document.body.classList.add("expanded");
  document.querySelector("#purport").hidden = !reflection.meaning;
  expandElement.setAttribute("aria-expanded", "true");
  expandElement.textContent = "Full verse open";
  document.querySelector("#timing-note").textContent = "Stay as long as you like";
  window.krishna.expand();
  playGesture();
  fitWindowToCard();
}

function collapse() {
  clearTimeout(revealTimer);
  phase = "withdrawing";
  cardElement.inert = true;
  document.body.dataset.phase = phase;
  nextElement.disabled = true;
  syncSprite();
}

function dismiss() {
  if (phase === "absent" || phase === "withdrawing") return;
  collapse();
  window.krishna.dismiss();
}

document.querySelector("#dismiss").addEventListener("click", dismiss);
expandElement.addEventListener("click", expand);
translationElement.addEventListener("click", expand);
nextElement.addEventListener("click", () => {
  if (phase !== "present" || nextElement.disabled) return;
  nextElement.disabled = true;
  window.krishna.next();
});
cardElement.addEventListener("pointerdown", () => window.krishna.engage());
sourceElement.addEventListener("click", () => {
  if (currentSource) window.krishna.openSource(currentSource);
});
document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key === "Escape") { event.preventDefault(); dismiss(); }
  // Native button Enter stays native, so source/next/dismiss are not hijacked.
  if (event.key === "Enter" && !event.target.closest("button, a")) {
    event.preventDefault();
    if (!expanded) expand();
  }
});
document.addEventListener("visibilitychange", syncSprite);
if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", syncSprite);
initSprite();
window.krishna.onShow(showTeaching);
window.krishna.onCollapse(collapse);
