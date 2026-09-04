function matchesInvocation(text) {
  if (typeof text !== "string") return false;

  const invocation = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\p{P}\s]+/gu, " ")
    .trim();

  return /^(?:hare|hari) (?:krishna|krsna|krsn|rama)$/.test(invocation);
}

module.exports = { matchesInvocation };
