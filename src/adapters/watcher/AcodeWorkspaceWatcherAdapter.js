
export default class AcodeWorkspaceWatcherAdapter {
  constructor({
    fileSystem,
    pollInterval = 2000,
    maxDepth = 30,
    maxFiles = 10000,
    exclude = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      "__pycache__",
      ".next",
      ".venv",
      "venv"
    ]
  } = {}) {
    if (
      !fileSystem ||
      typeof fileSystem.findFiles !== "function"
    ) {
      throw new Error(
        "AcodeWorkspaceWatcherAdapter requires a FileSystemAdapter."
      );
    }

    this.fileSystem = fileSystem;

    this.pollInterval = Math.max(
      500,
      Number(pollInterval) || 2000
    );

    this.maxDepth = maxDepth;
    this.maxFiles = maxFiles;
    this.exclude = exclude;

    this.workspace = null;
    this.snapshot = new Map();
    this.listeners = new Map();

    this.polling = false;
    this.pollPromise = null;

    this.intervalId = null;
    this.destroyed = false;
    this.generation = 0;
  }

  async start(workspace) {
    this.ensureActive();
    this.validateWorkspace(workspace);

    await this.stop();

    this.ensureActive();

    const generation = ++this.generation;

    this.workspace = {
      ...workspace
    };

    const initialSnapshot =
      await this.createSnapshot(this.workspace);

    this.ensureGeneration(generation);

    this.snapshot = initialSnapshot;

    this.intervalId = setInterval(() => {
      this.checkForChanges().catch((error) => {
        if (!this.destroyed) {
          console.error(
            "[RouteLens] Workspace watcher failed:",
            error
          );

          this.emit("error", {
            workspace: this.workspace,
            error
          });
        }
      });
    }, this.pollInterval);

    this.emit("started", {
      workspace: this.workspace,
      fileCount: this.snapshot.size
    });

    return {
      workspace: this.workspace,
      fileCount: this.snapshot.size
    };
  }

  async stop() {
    this.ensureActive();

    this.generation++;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.pollPromise) {
      try {
        await this.pollPromise;
      } catch {
        // Previous polling errors are handled by the caller.
      }
    }

    this.workspace = null;
    this.snapshot.clear();

    this.emit("stopped");

    return true;
  }

  async checkForChanges() {
    this.ensureActive();

    if (!this.workspace || this.polling) {
      return null;
    }

    this.polling = true;

    const generation = this.generation;
    const workspace = this.workspace;

    const operation = (async () => {
      const nextSnapshot =
        await this.createSnapshot(workspace);

      this.ensureGeneration(generation);

      const changes = this.compareSnapshots(
        this.snapshot,
        nextSnapshot
      );

      if (changes.total === 0) {
        return null;
      }

      this.snapshot = nextSnapshot;

      const event = {
        workspace,
        changes,
        total: changes.total,
        detectedAt: Date.now()
      };

      this.emit("change", event);

      return event;
    })();

    this.pollPromise = operation;

    try {
      return await operation;
    } finally {
      if (this.pollPromise === operation) {
        this.pollPromise = null;
        this.polling = false;
      }
    }
  }

  async createSnapshot(workspace) {
    this.ensureActive();

    const files = await this.fileSystem.findFiles(
      workspace.root,
      {
        maxDepth: this.maxDepth,
        maxFiles: this.maxFiles,
        exclude: this.exclude
      }
    );

    this.ensureActive();

    const snapshot = new Map();

    for (const filePath of files) {
      this.ensureActive();

      let metadata = null;

      try {
        metadata = await this.fileSystem.stat(filePath);
      } catch {
        // Some providers do not expose file metadata.
      }

      snapshot.set(
        filePath,
        this.createFileSignature(metadata)
      );
    }

    return snapshot;
  }

  createFileSignature(metadata) {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const modified =
      metadata.mtimeMs ??
      metadata.mtime ??
      metadata.lastModified ??
      metadata.modifiedAt ??
      metadata.modified ??
      null;

    const size =
      metadata.size ??
      metadata.length ??
      null;

    return JSON.stringify({
      modified: this.normalizeMetadataValue(modified),
      size: this.normalizeMetadataValue(size)
    });
  }

  normalizeMetadataValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "object") {
      if (typeof value.getTime === "function") {
        return value.getTime();
      }

      return String(value);
    }

    return value;
  }

  compareSnapshots(previous, next) {
    const added = [];
    const modified = [];
    const deleted = [];

    for (const [ filePath, signature ] of next) {
      if (!previous.has(filePath)) {
        added.push(filePath);
        continue;
      }

      const previousSignature = previous.get(filePath);

      if (
        signature !== null &&
        previousSignature !== null &&
        signature !== previousSignature
      ) {
        modified.push(filePath);
      }
    }

    for (const filePath of previous.keys()) {
      if (!next.has(filePath)) {
        deleted.push(filePath);
      }
    }

    const renamed = this.detectRenames(
      deleted,
      added,
      previous,
      next
    );

    const renamedOldPaths = new Set(
      renamed.map((item) => item.from)
    );

    const renamedNewPaths = new Set(
      renamed.map((item) => item.to)
    );

    return {
      added: added.filter(
        (filePath) => !renamedNewPaths.has(filePath)
      ),
      modified,
      deleted: deleted.filter(
        (filePath) => !renamedOldPaths.has(filePath)
      ),
      renamed,
      total:
        added.length +
        modified.length +
        deleted.length
    };
  }

  detectRenames(deleted, added, previous, next) {
    const addedBySignature = new Map();

    for (const filePath of added) {
      const signature = next.get(filePath);

      if (signature === null) {
        continue;
      }

      if (!addedBySignature.has(signature)) {
        addedBySignature.set(signature, []);
      }

      addedBySignature.get(signature).push(filePath);
    }

    const renamed = [];

    for (const oldPath of deleted) {
      const signature = previous.get(oldPath);

      if (signature === null) {
        continue;
      }

      const candidates = addedBySignature.get(signature);

      if (!candidates || candidates.length === 0) {
        continue;
      }

      const newPath = candidates.shift();

      renamed.push({
        from: oldPath,
        to: newPath
      });
    }

    return renamed;
  }

  subscribe(event, callback) {
    this.ensureActive();

    if (
      typeof event !== "string" ||
      !event.trim()
    ) {
      throw new TypeError(
        "Event name must be a non-empty string."
      );
    }

    if (typeof callback !== "function") {
      throw new TypeError(
        "Callback must be a function."
      );
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const callbacks = this.listeners.get(event);

    callbacks.add(callback);

    return () => {
      callbacks.delete(callback);

      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit(event, data = null) {
    const callbacks = this.listeners.get(event);

    if (!callbacks) {
      return;
    }

    for (const callback of [ ...callbacks ]) {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `[RouteLens] Watcher listener failed (${event}):`,
          error
        );
      }
    }
  }

  validateWorkspace(workspace) {
    if (
      !workspace ||
      typeof workspace !== "object" ||
      typeof workspace.root !== "string" ||
      !workspace.root.trim()
    ) {
      throw new TypeError(
        "A valid workspace is required."
      );
    }
  }

  ensureGeneration(generation) {
    this.ensureActive();

    if (generation !== this.generation) {
      throw new Error(
        "Workspace watcher operation was cancelled."
      );
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "AcodeWorkspaceWatcherAdapter has been destroyed."
      );
    }
  }

  async destroy() {
    if (this.destroyed) {
      return;
    }

    await this.stop();

    this.listeners.clear();
    this.snapshot.clear();

    this.workspace = null;
    this.fileSystem = null;
    this.destroyed = true;
  }
}
