// A readable teaching record: an object carrying at least a string reference and
// a string explanation. Anything else (null, arrays, missing/non-string fields)
// is corrupt and must never reach the reader or crash the CLI.
function isValidHistoryEntry(entry) {
  return !!entry
    && typeof entry === "object"
    && !Array.isArray(entry)
    && typeof entry.reference === "string"
    && typeof entry.explanation === "string";
}

function normalizeJourney(saved, reflectionCount, fallbackIndex = 0) {
  const candidate = Number.isInteger(saved?.nextVerseIndex)
    ? saved.nextVerseIndex
    : fallbackIndex;
  const nextVerseIndex = ((candidate % reflectionCount) + reflectionCount) % reflectionCount;
  return {
    version: 1,
    nextVerseIndex,
    completedCycles: Number.isInteger(saved?.completedCycles) ? saved.completedCycles : 0,
    history: Array.isArray(saved?.history) ? saved.history.filter(isValidHistoryEntry).slice(-100) : []
  };
}

function recordTeaching(current, index, reflection, shownAt = new Date().toISOString(), reflectionCount) {
  const nextVerseIndex = (index + 1) % reflectionCount;
  const entry = {
    reference: reflection.reference,
    translation: reflection.translation,
    explanation: reflection.meaning,
    source: reflection.source,
    shownAt
  };
  return {
    version: 1,
    nextVerseIndex,
    completedCycles: (current.completedCycles || 0) + (nextVerseIndex === 0 ? 1 : 0),
    history: [...(current.history || []), entry].slice(-100)
  };
}

module.exports = { normalizeJourney, recordTeaching, isValidHistoryEntry };
