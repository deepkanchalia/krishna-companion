const cardElement = document.querySelector(".card");
const translationElement = document.querySelector("#translation");
const meaningElement = document.querySelector("#meaning");
const sourceElement = document.querySelector("#source");
const expandElement = document.querySelector("#expand");
const nextElement = document.querySelector("#next");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let currentSource;
let reflection;
let revealTimer;
let phase = "absent";
let expanded = false;

function fitWindowToCard() {
  window.krishna.resize(cardElement.scrollHeight + 32);
}

function revealMessage() {
  clearTimeout(revealTimer);
  if (phase !== "arriving") return;
  phase = "present";
  document.body.dataset.phase = phase;
  document.querySelector("#messages").setAttribute("aria-busy", "false");
  nextElement.disabled = false;
  window.krishna.ready();
  fitWindowToCard();
}

function showTeaching({ reflection: incoming, durationSeconds, preview = false, continuing = false }) {
  clearTimeout(revealTimer);
  reflection = incoming;
  currentSource = reflection.source;
  expanded = false;
  phase = "arriving";
  cardElement.inert = false;
  document.body.classList.remove("listening", "expanded");
  document.body.classList.toggle("continuing", continuing);
  document.body.dataset.phase = phase;
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
  revealTimer = setTimeout(revealMessage, reducedMotion.matches ? 0 : (continuing ? 320 : 1_100));
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
  fitWindowToCard();
}

function collapse() {
  clearTimeout(revealTimer);
  phase = "withdrawing";
  cardElement.inert = true;
  document.body.dataset.phase = phase;
  document.body.classList.remove("listening");
  nextElement.disabled = true;
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
window.krishna.onShow(showTeaching);
window.krishna.onCollapse(collapse);
window.krishna.onListening((active) => document.body.classList.toggle("listening", active));
