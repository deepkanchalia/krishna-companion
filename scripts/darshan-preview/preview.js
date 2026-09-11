const frame = document.querySelector("#darshan");
const verse = document.querySelector("#verse");
const styleSelect = document.querySelector("#style");
const sizeSelect = document.querySelector("#size");
// ?style=&size=&verse= preset the controls so a headless capture can open a given state.
const params = new URLSearchParams(location.search);
for (const [select, name] of [[styleSelect, "style"], [sizeSelect, "size"], [verse, "verse"]]) {
  const wanted = params.get(name);
  if (wanted && [...select.options].some((option) => option.value === wanted)) select.value = wanted;
}
frame.style.width = `${sizeSelect.value}px`;
let desiredHeight = 380;
function fit() { frame.style.height = `${Math.min(Math.max(380, desiredHeight), window.innerHeight - 90)}px`; }
function send(type) {
  frame.contentWindow.postMessage({ type, verse: verse.value }, location.origin);
}
document.querySelector("#invite").addEventListener("click", () => send("show"));
document.querySelector("#withdraw").addEventListener("click", () => send("withdraw"));
document.querySelector("#style").addEventListener("change", (event) => {
  frame.contentWindow.postMessage({ type: "style", style: event.target.value }, location.origin);
});
verse.addEventListener("change", () => send("show"));
document.querySelector("#size").addEventListener("change", (event) => {
  frame.style.width = `${event.target.value}px`;
  send("show");
});
window.addEventListener("resize", fit);
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  if (event.data.type === "ready") {
    // The figure list comes from the renderer's manifest, never typed here.
    if (Array.isArray(event.data.styles) && event.data.styles.length) {
      const wanted = params.get("style") || styleSelect.value;
      styleSelect.replaceChildren(...event.data.styles.map((name) => Object.assign(document.createElement("option"), { value: name, textContent: name[0].toUpperCase() + name.slice(1) })));
      if (event.data.styles.includes(wanted)) styleSelect.value = wanted;
    }
    frame.contentWindow.postMessage({ type: "style", style: styleSelect.value }, location.origin);
    send("show");
  }
  if (event.data.type === "resize" && Number.isFinite(event.data.height)) {
    desiredHeight = event.data.height;
    fit();
  }
  if (event.data.type === "status") document.querySelector("#status").textContent = event.data.label;
});
