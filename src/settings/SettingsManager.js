
const DEFAULT_SETTINGS = {
  scanning: {
    enabledFrameworks: [
      "flask",
      "express",
      "laravel"
    ],
    excludeDirectories: [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      "vendor",
      "__pycache__",
      ".venv",
      "venv"
    ],
    scanHiddenFiles: false,
    maxFileSize: 1024 * 1024
  },

  analysis: {
    detectDuplicates: true,
    detectConflicts: true,
    matchFrontendCalls: false
  },

  interface: {
    theme: "dark",
    showStatistics: true,
    showSourceLocations: true,
    compactMode: false
  },

  export: {
    defaultFormat: "markdown",
    includeAnalysis: true,
    prettyJson: true
  }
};

export default class SettingsManager {
  constructor({
    storage = null,
    defaults = DEFAULT_SETTINGS
  } = {}) {
    this.storage = storage;

    this.defaults = this.clone(defaults);
    this.settings = this.clone(defaults);

    this.listeners = new Set();

    this.initialized = false;
    this.destroyed = false;
  }

  async init() {
    this.ensureActive();

    if (this.initialized) {
      return this.getAll();
    }

    try {
      const stored = this.storage &&
        typeof this.storage.get === "function"
        ? await this.storage.get("routelens.settings")
        : null;

      if (stored && typeof stored === "object") {
        this.settings = this.merge(
          this.defaults,
          stored
        );
      }

      this.validate(this.settings);
      this.initialized = true;

      return this.getAll();
    } catch (error) {
      this.settings = this.clone(this.defaults);
      this.initialized = false;

      throw error;
    }
  }

  getAll() {
    this.ensureActive();
    return this.clone(this.settings);
  }

  get(key) {
    this.ensureActive();

    if (typeof key !== "string" || !key.trim()) {
      return this.getAll();
    }

    const value = this.getNestedValue(
      this.settings,
      key
    );

    return value === undefined
      ? undefined
      : this.clone(value);
  }

  async set(key, value) {
    this.ensureInitialized();

    if (typeof key !== "string" || !key.trim()) {
      throw new TypeError(
        "A valid setting key is required."
      );
    }

    const updated = this.clone(this.settings);

    this.setNestedValue(
      updated,
      key,
      this.clone(value)
    );

    this.validate(updated);

    this.settings = updated;

    await this.persist();

    this.emit({
      type: "settings:changed",
      key,
      value: this.clone(value),
      settings: this.getAll()
    });

    return this.get(key);
  }

  async update(values) {
    this.ensureInitialized();

    if (
      !values ||
      typeof values !== "object" ||
      Array.isArray(values)
    ) {
      throw new TypeError(
        "Settings update must be an object."
      );
    }

    const updated = this.merge(
      this.settings,
      values
    );

    this.validate(updated);

    this.settings = updated;

    await this.persist();

    this.emit({
      type: "settings:updated",
      settings: this.getAll()
    });

    return this.getAll();
  }

  async reset() {
    this.ensureInitialized();

    this.settings = this.clone(this.defaults);

    await this.persist();

    this.emit({
      type: "settings:reset",
      settings: this.getAll()
    });

    return this.getAll();
  }

  subscribe(callback) {
    this.ensureActive();

    if (typeof callback !== "function") {
      throw new TypeError(
        "Settings listener must be a function."
      );
    }

    this.listeners.add(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  async persist() {
    if (
      this.storage &&
      typeof this.storage.set === "function"
    ) {
      await this.storage.set(
        "routelens.settings",
        this.clone(this.settings)
      );
    }
  }

  validate(settings) {
    if (!settings || typeof settings !== "object") {
      throw new TypeError(
        "Settings must be an object."
      );
    }

    const scanning = settings.scanning;
    const analysis = settings.analysis;
    const ui = settings.interface;
    const exportSettings = settings.export;

    if (
      !scanning ||
      !Array.isArray(scanning.enabledFrameworks) ||
      !Array.isArray(scanning.excludeDirectories)
    ) {
      throw new Error(
        "Invalid scanning settings."
      );
    }

    if (
      typeof scanning.scanHiddenFiles !== "boolean" ||
      !Number.isFinite(scanning.maxFileSize) ||
      scanning.maxFileSize <= 0
    ) {
      throw new Error(
        "Invalid scanning configuration."
      );
    }

    if (
      !analysis ||
      typeof analysis.detectDuplicates !== "boolean" ||
      typeof analysis.detectConflicts !== "boolean" ||
      typeof analysis.matchFrontendCalls !== "boolean"
    ) {
      throw new Error(
        "Invalid analysis settings."
      );
    }

    if (
      !ui ||
      ![ "dark", "light", "system" ].includes(ui.theme) ||
      typeof ui.showStatistics !== "boolean" ||
      typeof ui.showSourceLocations !== "boolean" ||
      typeof ui.compactMode !== "boolean"
    ) {
      throw new Error(
        "Invalid interface settings."
      );
    }

    if (
      !exportSettings ||
      ![ "markdown", "json" ].includes(
        exportSettings.defaultFormat
      ) ||
      typeof exportSettings.includeAnalysis !== "boolean" ||
      typeof exportSettings.prettyJson !== "boolean"
    ) {
      throw new Error(
        "Invalid export settings."
      );
    }

    for (const framework of scanning.enabledFrameworks) {
      if (
        typeof framework !== "string" ||
        !framework.trim()
      ) {
        throw new Error(
          "Enabled frameworks must contain valid names."
        );
      }
    }

    for (const directory of scanning.excludeDirectories) {
      if (
        typeof directory !== "string" ||
        !directory.trim()
      ) {
        throw new Error(
          "Excluded directories must contain valid names."
        );
      }
    }

    return true;
  }

  merge(base, updates) {
    const result = this.clone(base);

    for (const [ key, value ] of Object.entries(updates || {})) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        result[ key ] &&
        typeof result[ key ] === "object" &&
        !Array.isArray(result[ key ])
      ) {
        result[ key ] = this.merge(result[ key ], value);
      } else {
        result[ key ] = this.clone(value);
      }
    }

    return result;
  }

  getNestedValue(object, path) {
    return path.split(".").reduce(
      (current, key) =>
        current && Object.prototype.hasOwnProperty.call(current, key)
          ? current[ key ]
          : undefined,
      object
    );
  }

  setNestedValue(object, path, value) {
    const keys = path.split(".");
    let current = object;

    for (const key of keys.slice(0, -1)) {
      if (
        !current[ key ] ||
        typeof current[ key ] !== "object" ||
        Array.isArray(current[ key ])
      ) {
        current[ key ] = {};
      }

      current = current[ key ];
    }

    current[ keys[ keys.length - 1 ] ] = value;
  }

  clone(value) {
    if (value === undefined) {
      return undefined;
    }

    return structuredClone(value);
  }

  emit(event) {
    for (const listener of [ ...this.listeners ]) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          "[RouteLens] Settings listener failed:",
          error
        );
      }
    }
  }

  ensureInitialized() {
    this.ensureActive();

    if (!this.initialized) {
      throw new Error(
        "SettingsManager has not been initialized."
      );
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "SettingsManager has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.listeners.clear();

    this.storage = null;
    this.settings = {};
    this.defaults = {};

    this.initialized = false;
    this.destroyed = true;
  }
}
