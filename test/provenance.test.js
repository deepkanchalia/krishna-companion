const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Integrity gate for the verbatim corpus. Pure Node (no Electron), so it runs
// under `npm ci --ignore-scripts`. It fails CI when data/gita.json is edited
// without regenerating data/gita.manifest.json, or when the manifest goes stale.
// Regenerate both with `node scripts/fetch-vedabase.js --build`.
const dataDir = path.join(__dirname, "..", "data");
const corpusFile = path.join(dataDir, "gita.json");
const manifestFile = path.join(dataDir, "gita.manifest.json");

function versesInEntry(entry) {
  const [from, to] = String(entry.verse).split("-").map(Number);
  return (to || from) - from + 1;
}

test("data/gita.manifest.json's sha256 matches the committed corpus bytes", () => {
  const bytes = fs.readFileSync(corpusFile);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    manifest.sha256,
    actual,
    "manifest sha256 is stale: run `node scripts/fetch-vedabase.js --build` and commit both files"
  );
});

test("the manifest counts equal the values computed from the corpus data", () => {
  const entries = JSON.parse(fs.readFileSync(corpusFile, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

  const entryCount = entries.length;
  const verseCount = entries.reduce((sum, entry) => sum + versesInEntry(entry), 0);
  const chapterCount = new Set(entries.map((entry) => entry.chapter)).size;

  assert.equal(manifest.entryCount, entryCount, "manifest entryCount does not match the data");
  assert.equal(manifest.verseCount, verseCount, "manifest verseCount does not match the data");
  assert.equal(manifest.chapterCount, chapterCount, "manifest chapterCount does not match the data");

  // The corpus is fixed and complete; guard the absolute numbers too.
  assert.equal(entryCount, 657);
  assert.equal(verseCount, 700);
  assert.equal(chapterCount, 18);
});
