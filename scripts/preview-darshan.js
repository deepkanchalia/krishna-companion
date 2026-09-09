#!/usr/bin/env node
// A local renderer-only review surface. No Electron, permissions, or persistence.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { reflections } = require("../src/content");
const root = path.resolve(__dirname, "..");
const files = new Map([
  ["/", ["scripts/darshan-preview/index.html", "text/html"]],
  ["/preview.css", ["scripts/darshan-preview/preview.css", "text/css"]],
  ["/preview.js", ["scripts/darshan-preview/preview.js", "text/javascript"]],
  ["/preview-bridge.js", ["scripts/darshan-preview/bridge.js", "text/javascript"]],
  ["/src/index.html", ["src/index.html", "text/html"]],
  ["/src/renderer.js", ["src/renderer.js", "text/javascript"]],
  ["/src/styles.css", ["src/styles.css", "text/css"]],
  ["/assets/krishna.png", ["assets/krishna.png", "image/png"]]
]);
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  response.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/preview-corpus.js") {
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    response.end(`const previewReflections = ${JSON.stringify(reflections)};`);
    return;
  }
  const entry = files.get(url.pathname);
  if (!entry) { response.writeHead(404); response.end(); return; }
  let body = fs.readFileSync(path.join(root, entry[0]));
  if (url.pathname === "/src/index.html") {
    body = body.toString().replace('<script src="renderer.js">', '<script src="/preview-corpus.js"></script><script src="/preview-bridge.js"></script><script src="renderer.js">');
  }
  response.setHeader("Content-Type", `${entry[1]}; charset=utf-8`);
  response.end(body);
});
server.listen(4173, "127.0.0.1", () => console.log("Darshan preview: http://127.0.0.1:4173 — renderer only; journey unchanged"));
