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
let withdrawTimer;

// Sprite flipbook (src/sprite-player.js + assets/anim/manifest.js). Optional: when the
// manifest or the player is missing the CSS slide and the still image are used instead.
const spriteCanvas = document.querySelector(".sprite");
const Sprite = window.KrishnaSprite;
// One manifest per figure style (assets/anim/<style>/), assembled into manifest.js. A
// build with a single manifest still works: it becomes the only style.
const animStyles = window.KRISHNA_ANIM_STYLES
  || (window.KRISHNA_ANIM ? { [window.KRISHNA_ANIM_DEFAULT_STYLE || "default"]: window.KRISHNA_ANIM } : null);
const defaultStyle = window.KRISHNA_ANIM_DEFAULT_STYLE || (animStyles ? Object.keys(animStyles)[0] : null);
const spriteReady = Boolean(spriteCanvas && Sprite && animStyles && defaultStyle
  && Sprite.validateManifest(animStyles[defaultStyle]).length === 0);
let animManifest = spriteReady ? animStyles[defaultStyle] : null;
let currentStyle = spriteReady ? defaultStyle : null;
let player = null;

function createPlayer(manifest) {
  const created = Sprite.createSpritePlayer(manifest, {
    canvas: spriteCanvas,
    loadImage: (file) => { const img = new Image(); img.decoding = "async"; img.src = `../assets/anim/${file}`; return img; },
    raf: (fn) => window.requestAnimationFrame(fn),
    caf: (id) => window.cancelAnimationFrame(id),
    now: () => performance.now(),
    pixelRatio: () => window.devicePixelRatio || 1
  });
  created.preload();
  return created;
}

function initSprite() {
  if (!spriteReady) return;
  // The class goes on first so the canvas is displayed and measurable; the player sizes
  // its backing store from the live CSS size on every draw.
  document.body.classList.add("sprite");
  player = createPlayer(animManifest);
}

// Switch the figure style: unknown or invalid names are ignored, a present darshan
// changes on the spot (the idle loop restarts in the new style).
function selectStyle(name) {
  if (!spriteReady || !name || name === currentStyle) return;
  const manifest = animStyles[name];
  if (!manifest || Sprite.validateManifest(manifest).length > 0) return;
  if (player) player.stop();
  currentStyle = name;
  animManifest = manifest;
  player = createPlayer(manifest);
  document.body.dataset.style = name;
  if (phase !== "absent") syncSprite();
}

function setAbsent() {
  phase = "absent";
  document.body.dataset.phase = phase;
  clearTimeout(withdrawTimer);
  if (player) player.clear();
}

// Keep the flipbook in step with the darshan phase. Absent: nothing drawn, no frame
// loop. Hidden tab or reduced motion: one still frame, no loop.
function syncSprite() {
  if (!player) return;
  if (phase === "absent") { player.clear(); return; }
  // A hidden window mid-withdrawal is as good as gone: clear rather than freeze a frame.
  if (phase === "withdrawing" && document.hidden) { player.clear(); return; }
  if (document.hidden || reducedMotion.matches) { player.still(); return; }
  const segment = Sprite.segmentForPhase(phase, { continuing: continuingVerse });
  if (!segment) { player.clear(); return; }
  if (player.current() === segment) return;
  player.play(segment, onSegmentEnd);
}

function onSegmentEnd(name) {
  if (!player) return;
  if (name === "farewell") { if (phase === "withdrawing") setAbsent(); else player.clear(); return; }
  // The message reveals when the walk-in actually ends (the timer is only a fallback).
  if (name === "walkin" && phase === "arriving") revealMessage();
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

function showTeaching({ reflection: incoming, durationSeconds, preview = false, continuing = false, style, ...timings }) {
  clearTimeout(revealTimer);
  applyMotionTimings(timings);
  if (style) selectStyle(style);
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
  // With sprites the walk-in's end reveals the message (onSegmentEnd); this timer is a
  // fallback with slack for sheet decoding. Otherwise the CSS slide timing applies.
  clearTimeout(withdrawTimer);
  const arrival = player && !continuing ? Sprite.durationMs(animManifest.segments.walkin) + 800 : arrivalDelay;
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
  // Absent follows the farewell; if the loop cannot finish (hidden, failed sheet), a
  // timer with slack still clears the figure.
  clearTimeout(withdrawTimer);
  if (player) withdrawTimer = setTimeout(setAbsent, Sprite.durationMs(animManifest.segments.farewell) + 800);
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
if (window.krishna.onStyle) window.krishna.onStyle(selectStyle);
