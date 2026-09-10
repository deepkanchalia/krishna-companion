const DEFAULT_INTERVAL_MINUTES = 30;
// Zero uses the darshan's three-minute untouched timeout. A positive value
// overrides that timeout; opening the full verse always cancels it (darshan.js).
const DEFAULT_DURATION_SECONDS = 0;

// The bounds readConfig clamps to, named once so the second-instance validator can reuse
// the exact same limits instead of hard-coding its own copy (which drifted before).
const INTERVAL_MINUTES_MIN = 0.1;
const INTERVAL_MINUTES_MAX = 1440;
const DURATION_SECONDS_MIN = 0;
const DURATION_SECONDS_MAX = 120;

// Commands a second launch may forward to a running instance: exactly those bin/krshna.js
// starts Electron for, plus the /krshna hook alias. Single source of truth shared with the
// second-instance validator so the accepted set and the dispatcher cannot drift apart.
const SECOND_INSTANCE_COMMANDS = [
  "live", "start", "now", "pause", "resume", "stop", "voice-on", "voice-off", "/krshna"
];

function numberArgument(argv, name, fallback, minimum, maximum) {
  const prefix = `--${name}=`;
  const raw = argv.find((argument) => argument.startsWith(prefix));
  if (!raw) return fallback;

  const value = Number(raw.slice(prefix.length));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, minimum), maximum);
}

function hasFlag(argv, name) {
  const prefix = `--${name}=`;
  return argv.includes(`--${name}`) || argv.some((argument) => argument.startsWith(prefix));
}

function readConfig(argv = process.argv.slice(2)) {
  const commandArgument = argv.find((argument) => argument.startsWith("--command="));
  const demo = argv.includes("--demo");

  const verseArgument = argv.find((argument) => argument.startsWith("--verse="));

  return {
    demo,
    screenshot: argv.includes("--screenshot"),
    // Keep an explicit empty value ("--verse=") as "" rather than folding it to
    // undefined: an empty verse is a request error the caller must report, never a
    // silent fall-back to saved progress. Absence stays undefined.
    verse: verseArgument !== undefined ? verseArgument.slice("--verse=".length) : undefined,
    // A demo asks for a reflection right away, also when it reaches an instance that is already live.
    command: commandArgument?.slice("--command=".length) || (demo ? "now" : "live"),
    intervalMinutes: numberArgument(argv, "interval", DEFAULT_INTERVAL_MINUTES, INTERVAL_MINUTES_MIN, INTERVAL_MINUTES_MAX),
    durationSeconds: numberArgument(argv, "duration", DEFAULT_DURATION_SECONDS, DURATION_SECONDS_MIN, DURATION_SECONDS_MAX),
    // Which options this launch actually set, so a second instance can tell an
    // explicit --interval/--duration/--verse from a defaulted one (planSecondInstance).
    provided: {
      command: Boolean(commandArgument),
      verse: hasFlag(argv, "verse"),
      demo,
      screenshot: argv.includes("--screenshot"),
      interval: hasFlag(argv, "interval"),
      duration: hasFlag(argv, "duration")
    }
  };
}

module.exports = {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_INTERVAL_MINUTES,
  INTERVAL_MINUTES_MIN,
  INTERVAL_MINUTES_MAX,
  DURATION_SECONDS_MIN,
  DURATION_SECONDS_MAX,
  SECOND_INSTANCE_COMMANDS,
  hasFlag,
  numberArgument,
  readConfig
};
