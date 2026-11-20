
const LOG_LEVELS = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
});

export default class Logger {
  constructor(options = {}) {
    const {
      prefix = "RouteLens",
      level = "info",
      enabled = true,
      timestamp = false,
      consoleObject = globalThis.console
    } = options;

    if (!(level in LOG_LEVELS)) {
      throw new TypeError(
        `Invalid log level: ${level}`
      );
    }

    this.prefix = prefix;
    this.level = level;
    this.enabled = Boolean(enabled);
    this.timestamp = Boolean(timestamp);
    this.console = consoleObject || null;
    this.destroyed = false;
  }

  debug(...args) {
    this.write("debug", ...args);
  }

  info(...args) {
    this.write("info", ...args);
  }

  warn(...args) {
    this.write("warn", ...args);
  }

  error(...args) {
    this.write("error", ...args);
  }

  write(level, ...args) {
    this.ensureActive();

    if (!this.enabled || !this.shouldLog(level)) {
      return;
    }

    const method =
      level === "debug"
        ? "debug"
        : level === "info"
          ? "info"
          : level === "warn"
            ? "warn"
            : "error";

    const output = this.console?.[ method ];

    if (typeof output !== "function") {
      return;
    }

    const parts = [];

    if (this.timestamp) {
      parts.push(new Date().toISOString());
    }

    parts.push(`[${this.prefix}]`);

    output.call(
      this.console,
      parts.join(" "),
      ...args
    );
  }

  shouldLog(level) {
    const requestedLevel = LOG_LEVELS[ level ];
    const configuredLevel = LOG_LEVELS[ this.level ];

    if (requestedLevel === undefined) {
      return false;
    }

    return requestedLevel >= configuredLevel;
  }

  setLevel(level) {
    this.ensureActive();

    if (!(level in LOG_LEVELS)) {
      throw new TypeError(
        `Invalid log level: ${level}`
      );
    }

    this.level = level;
  }

  setEnabled(enabled) {
    this.ensureActive();
    this.enabled = Boolean(enabled);
  }

  setTimestamp(enabled) {
    this.ensureActive();
    this.timestamp = Boolean(enabled);
  }

  child(name) {
    this.ensureActive();

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      throw new TypeError(
        "Logger child name must be a non-empty string."
      );
    }

    return new Logger({
      prefix: `${this.prefix}:${name.trim()}`,
      level: this.level,
      enabled: this.enabled,
      timestamp: this.timestamp,
      consoleObject: this.console
    });
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("Logger has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.console = null;
    this.destroyed = true;
  }
}

export { LOG_LEVELS };
