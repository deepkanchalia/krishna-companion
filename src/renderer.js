const cardElement = document.querySelector(".card");
const translationElement = document.querySelector("#translation");
const meaningElement = document.querySelector("#meaning");
const sourceElement = document.querySelector("#source");
const dismissElement = document.querySelector("#dismiss");

// The card sits inside the window with 8px insets top and bottom (see .card in styles.css).
const CARD_INSET_HEIGHT = 16;

let currentSource;

// Verbatim translations run from one line to a paragraph; let the window grow to fit.
function fitWindowToCard() {
  cardElement.scrollTop = 0;
  window.krishna.resize(cardElement.scrollHeight + CARD_INSET_HEIGHT);
}

function showTeaching({ reflection, durationSeconds }) {
  currentSource = reflection.source;
  translationElement.textContent = reflection.translation;
  meaningElement.textContent = reflection.meaning;
  meaningElement.hidden = !reflection.meaning;
  const compactReference = reflection.reference.replace("Bhagavad-gītā As It Is ", "BG ");
  sourceElement.textContent = `${compactReference} · Bhaktivedanta VedaBase ↗`;
  sourceElement.title = reflection.reference;
  document.documentElement.style.setProperty("--duration", `${durationSeconds}s`);

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
sourceElement.addEventListener("click", () => {
  if (currentSource) window.krishna.openSource(currentSource);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "Enter") dismiss();
});

window.krishna.onShow(showTeaching);
window.krishna.onCollapse(collapse);
