const INVOCATION_PATTERN = String.raw`(?:hare|hari) (?:krishna|krsna|krsn|rama)`;

function normalizeInvocation(text) {
  if (typeof text !== "string") return false;

  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\p{P}\s]+/gu, " ")
    .trim();
}

function matchesInvocation(text) {
  const invocation = normalizeInvocation(text);
  if (invocation === false) return false;

  return new RegExp(`^${INVOCATION_PATTERN}$`).test(invocation);
}

function containsInvocation(text) {
  const invocation = normalizeInvocation(text);
  if (invocation === false) return false;

  return new RegExp(`(?:^| )${INVOCATION_PATTERN}(?: |$)`).test(invocation);
}

module.exports = { containsInvocation, matchesInvocation };
