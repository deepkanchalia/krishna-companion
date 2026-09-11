const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Load the real preload under a fake contextBridge and record exactly what it exposes on
// window.krishna. The renderer only ever calls these methods, so pinning the exact set
// here turns any drift between preload and renderer into a failing test rather than a
// silent `undefined is not a function` at runtime.
function exposedApi() {
  const preloadSource = fs.readFileSync(path.join(__dirname, "..", "src", "preload.js"), "utf8");
  const exposed = {};
  const context = {
    require: (name) => {
      if (name === "electron") {
        return {
          contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } },
          ipcRenderer: { send() {}, on() {}, removeListener() {} }
        };
      }
      return require(name);
    }
  };
  vm.runInNewContext(preloadSource, context);
  return exposed;
}

test("preload exposes exactly the krishna bridge the renderer consumes", () => {
  const exposed = exposedApi();
  assert.deepEqual(Object.keys(exposed), ["krishna"], "only the krishna namespace is exposed");
  const keys = Object.keys(exposed.krishna).sort();
  assert.deepEqual(keys, [
    "dismiss", "engage", "expand", "next", "onCollapse", "onListening",
    "onShow", "onStyle", "openSource", "ready", "resize"
  ], "the exposed surface matches what src/renderer.js calls");
  for (const key of keys) assert.equal(typeof exposed.krishna[key], "function", `${key} is a function`);
});
