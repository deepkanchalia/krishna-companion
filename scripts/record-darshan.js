#!/usr/bin/env node
"use strict";

/**
 * Record the darshan for docs/media/darshan.gif (and darshan.webp when ffmpeg can
 * encode it). Anyone can regenerate the hero recording with this script.
 *
 * Primary method (a real recording of the renderer):
 *   1. Launch Chrome headless with remote debugging on port 9333.
 *   2. Connect to the page target over the DevTools protocol (Node's global
 *      WebSocket; the page's webSocketDebuggerUrl comes from
 *      http://127.0.0.1:9333/json).
 *   3. Navigate to the running preview at http://127.0.0.1:4173/?style=realistic
 *      (start `node scripts/preview-darshan.js` first), which auto-plays the
 *      walk-in.
 *   4. Page.startScreencast (png, everyFrame 1); save every Page.screencastFrame
 *      and ack each one. Capture the walk-in, three seconds standing, then click
 *      #expand inside the iframe for the teaching gesture, wait four seconds,
 *      click #withdraw on the outer page, wait five seconds, stop.
 *   5. Crop every frame to the iframe region (the darshan area, found from
 *      document.querySelector('#darshan').getBoundingClientRect()), so the
 *      preview page header stays out of the crop, then ffmpeg to a 12 fps GIF
 *      with a generated palette, width 800, kept under 6 MB. An animated webp is
 *      written too when ffmpeg supports it, otherwise it is skipped.
 *
 * Fallback method: if the screencast approach fails after two attempts, the GIF
 * is composed from the real sprite frames in assets/anim/realistic/*.webp using
 * the manifest's frame rects and fps over a dark background (Python with PIL).
 * When this path is used the script prints that it fell back.
 *
 * Usage:
 *   node scripts/preview-darshan.js        # in one terminal (serves port 4173)
 *   node scripts/record-darshan.js         # in another
 */

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn, spawnSync, execFileSync } = require("node:child_process");

const PORT = 9333;
const PREVIEW_URL = "http://127.0.0.1:4173/?style=realistic";
const REPO_ROOT = path.join(__dirname, "..");
const MEDIA_DIR = path.join(REPO_ROOT, "docs", "media");
const GIF_OUT = path.join(MEDIA_DIR, "darshan.gif");
const WEBP_OUT = path.join(MEDIA_DIR, "darshan.webp");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A minimal DevTools protocol client over one page WebSocket.
class Devtools {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    });
  }
  ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  close() {
    try { this.ws.close(); } catch { /* already closed */ }
  }
}

function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-record-"));
  const child = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--window-size=1100,620",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "about:blank"
  ], { stdio: "ignore" });
  return { child, profile };
}

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const out = execFileSync("curl", ["-s", `http://127.0.0.1:${PORT}/json`], { encoding: "utf8" });
      const targets = JSON.parse(out);
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint did not come up");
}

// Even integer, clamped to [0, max].
const evenClamp = (value, max) => Math.max(0, Math.min(Math.floor(value / 2) * 2, Math.floor(max / 2) * 2));

async function recordOnce(framesDir) {
  const wsUrl = await pageTarget();
  const dt = new Devtools(wsUrl);
  await dt.ready();
  await dt.send("Page.enable");
  await dt.send("Runtime.enable");

  await dt.send("Page.navigate", { url: PREVIEW_URL });
  await sleep(900); // let the iframe lay out; the walk-in plays into the screencast

  // Hide the preview page's own chrome so nothing shows through the transparent
  // parts of the darshan iframe. The #withdraw button still exists and .click()
  // works on it while hidden.
  await dt.send("Runtime.evaluate", {
    expression: "for (const sel of ['header','nav','footer','.workspace']) { const el = document.querySelector(sel); if (el) el.style.display = 'none'; }"
  });

  const rectResult = await dt.send("Runtime.evaluate", {
    expression: "JSON.stringify((()=>{const r=document.querySelector('#darshan').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})())",
    returnByValue: true
  });
  const rect = JSON.parse(rectResult.result.value);

  const frames = [];
  dt.on("Page.screencastFrame", async (params) => {
    frames.push({ data: params.data, timestamp: params.metadata.timestamp });
    try { await dt.send("Page.screencastFrameAck", { sessionId: params.sessionId }); } catch { /* stopping */ }
  });

  await dt.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 1100, maxHeight: 620 });

  await sleep(5000); // walk-in plus a couple of seconds standing
  await dt.send("Runtime.evaluate", {
    expression: "document.querySelector('#darshan').contentDocument.querySelector('#expand').click()"
  });
  await sleep(3500); // teaching gesture and reading
  await dt.send("Runtime.evaluate", {
    expression: "document.querySelector('#withdraw').click()"
  });
  await sleep(3500); // farewell and clear

  await dt.send("Page.stopScreencast");
  await sleep(300);
  dt.close();

  if (frames.length < 12) throw new Error(`too few frames captured (${frames.length})`);

  const list = [];
  frames.forEach((frame, index) => {
    const file = path.join(framesDir, `f${String(index).padStart(5, "0")}.png`);
    fs.writeFileSync(file, Buffer.from(frame.data, "base64"));
    const next = frames[index + 1];
    const duration = next ? Math.max(0.02, next.timestamp - frame.timestamp) : 0.2;
    list.push(`file '${file}'`);
    list.push(`duration ${duration.toFixed(3)}`);
  });
  list.push(`file '${path.join(framesDir, `f${String(frames.length - 1).padStart(5, "0")}.png`)}'`);
  const listFile = path.join(framesDir, "frames.txt");
  fs.writeFileSync(listFile, list.join("\n"));

  const cropW = evenClamp(rect.w, 1100 - rect.x);
  const cropH = evenClamp(rect.h, 620 - rect.y);
  const cropX = Math.max(0, Math.round(rect.x));
  const cropY = Math.max(0, Math.round(rect.y));
  const crop = `crop=${cropW}:${cropH}:${cropX}:${cropY}`;

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const gifFilter = `${crop},fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-filter_complex", gifFilter, "-loop", "0", GIF_OUT], { stdio: "inherit" });

  try {
    const webpFilter = `${crop},fps=12,scale=800:-1:flags=lanczos`;
    execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", webpFilter, "-loop", "0", "-c:v", "libwebp_anim", "-lossless", "0", "-q:v", "70", WEBP_OUT], { stdio: "ignore" });
  } catch {
    process.stdout.write("animated webp not written (ffmpeg lacks the encoder); skipping.\n");
  }

  return frames.length;
}

// Fallback: build the GIF straight from the shipped sprite frames with PIL.
function fallback() {
  process.stdout.write("Screencast failed twice; falling back to sprite frames.\n");
  const py = path.join(os.tmpdir(), "krshna-fallback.py");
  fs.writeFileSync(py, FALLBACK_PY);
  spawnSync("python3", [py, REPO_ROOT, GIF_OUT], { stdio: "inherit" });
}

const FALLBACK_PY = `
import sys, os, json
from PIL import Image
root, out = sys.argv[1], sys.argv[2]
anim = os.path.join(root, 'assets', 'anim', 'realistic')
manifest = json.load(open(os.path.join(anim, 'manifest.json')))
order = ['walkin', 'idle', 'teach', 'idle', 'farewell']
bg = (16, 23, 20)
frames, durations = [], []
for name in order:
    seg = manifest['segments'][name]
    sheet = Image.open(os.path.join(root, 'assets', 'anim', seg['file'])).convert('RGBA')
    fps = seg.get('fps', 12)
    for fr in seg['frames']:
        r = fr['rect'] if 'rect' in fr else fr
        x, y, w, h = r['x'], r['y'], r['w'], r['h']
        crop = sheet.crop((x, y, x + w, y + h))
        canvas = Image.new('RGBA', (800, 460), bg + (255,))
        canvas.alpha_composite(crop, (400 - w // 2, 440 - h))
        frames.append(canvas.convert('P', palette=Image.ADAPTIVE))
        durations.append(int(1000 / fps))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2)
print('wrote', out, len(frames), 'frames')
`;

async function main() {
  const framesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-frames-"));
  let chrome;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const framesDir = path.join(framesRoot, `attempt-${attempt}`);
    fs.mkdirSync(framesDir, { recursive: true });
    chrome = launchChrome();
    try {
      const count = await recordOnce(framesDir);
      process.stdout.write(`Recorded ${count} frames. Wrote ${path.relative(REPO_ROOT, GIF_OUT)}.\n`);
      return;
    } catch (error) {
      process.stdout.write(`Attempt ${attempt} failed: ${error.message}\n`);
    } finally {
      try { chrome.child.kill(); } catch { /* gone */ }
      try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* gone */ }
    }
  }
  fallback();
}

main().then(() => process.exit(0)).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
