const cardElement = document.querySelector(".card");
const translationElement = document.querySelector("#translation");
const meaningElement = document.querySelector("#meaning");
const sourceElement = document.querySelector("#source");
const dismissElement = document.querySelector("#dismiss");

// The card sits inside the window with 9px insets top and bottom (see .card in styles.css).
const CARD_INSET_HEIGHT = 18;

let currentSource;

requestAnimationFrame(() => document.body.classList.add("ready"));

// Verbatim translations run from one line to a paragraph; let the window grow to fit.
function fitWindowToCard() {
  cardElement.scrollTop = 0;
  window.krishna.resize(cardElement.scrollHeight + CARD_INSET_HEIGHT);
}

function showTeaching({ reflection, durationSeconds }) {
  document.body.classList.remove("listening");
  currentSource = reflection.source;
  translationElement.textContent = reflection.translation;
  const words = reflection.translation.split(/\s+/).length;
  cardElement.classList.toggle("long", words > 60);
  cardElement.classList.toggle("very-long", words > 90);
  meaningElement.textContent = reflection.meaning;
  meaningElement.hidden = !reflection.meaning;
  const compactReference = reflection.reference.replace("Bhagavad-gītā As It Is ", "BG ");
  sourceElement.textContent = `${compactReference} · Bhaktivedanta VedaBase ↗`;
  sourceElement.title = reflection.reference;
  document.documentElement.style.setProperty("--duration", `${durationSeconds}s`);
  document.body.classList.toggle("timed", durationSeconds > 0);

  document.body.classList.remove("collapsing", "present");
  void document.body.offsetWidth;
  document.body.classList.add("present");
  fitWindowToCard();
}

function collapse() {
  document.body.classList.add("collapsing");
  document.body.classList.remove("present");
}

function dismiss() {
  collapse();
  window.krishna.dismiss();
}

dismissElement.addEventListener("click", dismiss);
cardElement.addEventListener("pointerdown", () => window.krishna.engage(), { once: false });
sourceElement.addEventListener("click", () => {
  if (currentSource) window.krishna.openSource(currentSource);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "Enter") dismiss();
});

window.krishna.onShow(showTeaching);
window.krishna.onCollapse(collapse);
window.krishna.onListening((active) => document.body.classList.toggle("listening", active));
