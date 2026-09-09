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
