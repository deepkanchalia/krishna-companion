const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_DURATION_SECONDS = 28;

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

  return {
    demo: argv.includes("--demo"),
    screenshot: argv.includes("--screenshot"),
    command: commandArgument?.slice("--command=".length) || "live",
    intervalMinutes: numberArgument(argv, "interval", DEFAULT_INTERVAL_MINUTES, 0.1, 1440),
    durationSeconds: numberArgument(argv, "duration", DEFAULT_DURATION_SECONDS, 5, 120)
  };
}

module.exports = {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_INTERVAL_MINUTES,
  numberArgument,
  readConfig
};
