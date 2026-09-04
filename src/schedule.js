function canShowTeaching({ paused, isExpanded, force = false }) {
  // Never advance the sequence behind a teaching the reader has not closed.
  if (isExpanded) return false;
  return force || !paused;
}

module.exports = { canShowTeaching };
