function normalizeJourney(saved, reflectionCount, fallbackIndex = 0) {
  const candidate = Number.isInteger(saved?.nextVerseIndex)
    ? saved.nextVerseIndex
    : fallbackIndex;
  const nextVerseIndex = ((candidate % reflectionCount) + reflectionCount) % reflectionCount;
  return {
    version: 1,
    nextVerseIndex,
    completedCycles: Number.isInteger(saved?.completedCycles) ? saved.completedCycles : 0,
    history: Array.isArray(saved?.history) ? saved.history.slice(-100) : []
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

module.exports = { normalizeJourney, recordTeaching };
