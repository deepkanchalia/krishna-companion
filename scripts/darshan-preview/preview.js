const frame = document.querySelector("#darshan");
const verse = document.querySelector("#verse");
document.querySelector("#size").options[0].value = "760";
let desiredHeight = 540;
function fit() { frame.style.height = `${Math.min(Math.max(540, desiredHeight), window.innerHeight - 90)}px`; }
function send(type) {
  frame.contentWindow.postMessage({ type, verse: verse.value }, location.origin);
}
document.querySelector("#invite").addEventListener("click", () => send("show"));
document.querySelector("#withdraw").addEventListener("click", () => send("withdraw"));
verse.addEventListener("change", () => send("show"));
document.querySelectorAll("[data-motion]").forEach((button) => {
  button.addEventListener("click", () => frame.contentWindow.postMessage({ type: "motion", action: button.dataset.motion }, location.origin));
});
function review(speed) {
  frame.contentWindow.postMessage({ type: "review", action: document.querySelector("#review-action").value, elapsed: Number(document.querySelector("#review-time").value), speed }, location.origin);
}
document.querySelector("#review-frame").addEventListener("click", () => review(0));
document.querySelector("#review-time").addEventListener("change", () => review(0));
document.querySelector("#review-slow").addEventListener("click", () => review(.25));
document.querySelector("#review-normal").addEventListener("click", () => review(1));
document.querySelector("#size").addEventListener("change", (event) => {
  frame.style.width = `${event.target.value}px`;
  send("show");
});
window.addEventListener("resize", fit);
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  if (event.data.type === "ready") send("show");
  if (event.data.type === "resize" && Number.isFinite(event.data.height)) {
    desiredHeight = event.data.height;
    fit();
  }
  if (event.data.type === "status") document.querySelector("#status").textContent = event.data.label;
});
