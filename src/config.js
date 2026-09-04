const DEFAULT_INTERVAL_MINUTES = 30;
// The reader closes the teaching. A positive --duration opts into auto-close.
const DEFAULT_DURATION_SECONDS = 0;

function numberArgument(argv, name, fallback, minimum, maximum) {
  const prefix = `--${name}=`;
  const raw = argv.find((argument) => argument.startsWith(prefix));
  if (!raw) return fallback;

  const value = Number(raw.slice(prefix.length));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, minimum), maximum);
}

function readConfig(argv = process.argv.slice(2)) {
  const commandArgument = argv.find((argument) => argument.startsWith("--command="));
  const demo = argv.includes("--demo");

  const verseArgument = argv.find((argument) => argument.startsWith("--verse="));

  return {
    demo,
    screenshot: argv.includes("--screenshot"),
    verse: verseArgument?.slice("--verse=".length) || undefined,
    // A demo asks for a reflection right away, also when it reaches an instance that is already live.
    command: commandArgument?.slice("--command=".length) || (demo ? "now" : "live"),
    intervalMinutes: numberArgument(argv, "interval", DEFAULT_INTERVAL_MINUTES, 0.1, 1440),
    durationSeconds: numberArgument(argv, "duration", DEFAULT_DURATION_SECONDS, 0, 120)
  };
}

module.exports = {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_INTERVAL_MINUTES,
  numberArgument,
  readConfig
};
