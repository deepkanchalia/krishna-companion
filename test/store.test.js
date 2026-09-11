const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readJson, writeJson } = require("../src/store");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krshna-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a corrupt file is quarantined, not silently replaced", (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "settings.json");
  fs.writeFileSync(file, "{ this is not json");
  const quarantined = [];

  const value = readJson(file, { fallback: true }, quarantined);

  assert.deepEqual(value, { fallback: true }, "the fallback is returned");
  assert.equal(quarantined.length, 1, "one quarantine was recorded");
  assert.equal(quarantined[0].file, file);
  assert.match(path.basename(quarantined[0].quarantinedTo), /^settings\.corrupt-[0-9TZ-]+-\d+\.json$/);
  assert.ok(path.basename(quarantined[0].quarantinedTo).endsWith(`-${process.pid}.json`), "the name carries this process's pid");
  assert.ok(fs.existsSync(quarantined[0].quarantinedTo), "the original was moved aside");
  assert.equal(fs.readFileSync(quarantined[0].quarantinedTo, "utf8"), "{ this is not json", "contents preserved");
  assert.ok(!fs.existsSync(file), "the corrupt file no longer sits at its original name");
});

test("valid JSON is returned and the file is left untouched", (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "state.json");
  const original = '{\n  "nextVerseIndex": 4\n}';
  fs.writeFileSync(file, original);
  const quarantined = [];

  assert.deepEqual(readJson(file, {}, quarantined), { nextVerseIndex: 4 });
  assert.equal(quarantined.length, 0, "nothing quarantined");
  assert.equal(fs.readFileSync(file, "utf8"), original, "file byte-identical");
});

test("a missing file returns the fallback with no quarantine", (t) => {
  const dir = tempDir(t);
  const quarantined = [];
  assert.deepEqual(readJson(path.join(dir, "nope.json"), { d: 1 }, quarantined), { d: 1 });
  assert.equal(quarantined.length, 0);
});

test("two corrupt reads produce two quarantine files with distinct names", (t) => {
  const dir = tempDir(t);
  const a = path.join(dir, "state.json");
  const b = path.join(dir, "journey.json");
  fs.writeFileSync(a, "nope");
  fs.writeFileSync(b, "also nope");
  const quarantined = [];

  readJson(a, {}, quarantined);
  readJson(b, null, quarantined);

  assert.equal(quarantined.length, 2);
  const names = quarantined.map((item) => path.basename(item.quarantinedTo));
  assert.notEqual(names[0], names[1], "the quarantine names differ");
  assert.match(names[0], /^state\.corrupt-[0-9TZ-]+-\d+\.json$/);
  assert.match(names[1], /^journey\.corrupt-[0-9TZ-]+-\d+\.json$/);
  for (const name of names) assert.ok(fs.existsSync(path.join(dir, name)));
});

test("a failed quarantine rename keeps the file read-only; a later save cannot overwrite it", {
  // Relies on a 0o500 directory blocking the rename; root ignores that mode, so the
  // rename would succeed and this failure path never run.
  skip: process.getuid && process.getuid() === 0 ? "root bypasses the read-only directory mode" : false
}, (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "settings.json");
  const originalBytes = "{ corrupt but precious";
  fs.writeFileSync(file, originalBytes);
  // A read-only directory makes the quarantine rename (and any write) fail.
  fs.chmodSync(dir, 0o500);
  t.after(() => { try { fs.chmodSync(dir, 0o700); } catch { /* already restored */ } });

  const quarantined = [];
  assert.deepEqual(readJson(file, { fallback: true }, quarantined), { fallback: true });
  assert.equal(quarantined.length, 1);
  assert.equal(quarantined[0].quarantinedTo, null, "recorded as unrepaired for the startup notice");
  assert.equal(fs.readFileSync(file, "utf8"), originalBytes, "the failed rename left the original bytes");

  // Even once the directory is writable again, the path stays read-only this session.
  fs.chmodSync(dir, 0o700);
  assert.equal(writeJson(file, { defaulted: true }), false, "the save is refused");
  assert.equal(fs.readFileSync(file, "utf8"), originalBytes, "original bytes survive a subsequent save call");
});

test("writeJson round-trips and never throws on a bad path", (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "nested", "settings.json");
  assert.equal(writeJson(file, { a: 1 }), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { a: 1 });

  // Writing where a file already occupies the directory position fails, but the save
  // must swallow it (log one line) rather than throw out of the app.
  const blocked = path.join(dir, "afile");
  fs.writeFileSync(blocked, "x");
  assert.equal(writeJson(path.join(blocked, "settings.json"), { a: 1 }), false);
});
