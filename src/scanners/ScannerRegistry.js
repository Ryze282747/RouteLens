export default class ScannerRegistry {
  constructor() {
    this.scanners = new Map();
    this.cleanupPromises = new Map();
    this.destroyed = false;
    this.destroyPromise = null;
  }

  register(scanner) {
    this.ensureActive();
    this.validateScanner(scanner);

    if (this.scanners.has(scanner.id)) {
      throw new Error(
        `Scanner "${scanner.id}" is already registered.`
      );
    }

    this.scanners.set(scanner.id, scanner);

    return scanner;
  }

  async unregister(id) {
    this.ensureActive();

    const scanner = this.scanners.get(id);

    if (!scanner) {
      return false;
    }

    // Remove it before cleanup so new detection passes cannot select it.
    this.scanners.delete(id);

    await this.destroyScanner(scanner);

    return true;
  }

  get(id) {
    this.ensureActive();
    return this.scanners.get(id) || null;
  }

  getAll() {
    this.ensureActive();
    return Array.from(this.scanners.values());
  }

  async detect(workspace, options = {}) {
    this.ensureActive();

    if (!workspace || typeof workspace !== "object") {
      throw new TypeError("A valid workspace is required.");
    }

    const detected = [];
    const scanners = Array.from(this.scanners.values());

    for (const scanner of scanners) {
      this.ensureActive();

      // Skip scanners that were unregistered during this detection pass.
      if (this.scanners.get(scanner.id) !== scanner) {
        continue;
      }

      let matches = false;

      try {
        matches = await scanner.detect(workspace, options);
      } catch (error) {
        this.ensureActive();

        console.error(
          `[RouteLens] Scanner detection failed (${scanner.id}):`,
          error
        );
      }

      // A destroy operation may have started while detect() was awaiting.
      this.ensureActive();

      if (
        matches &&
        this.scanners.get(scanner.id) === scanner
      ) {
        detected.push(scanner);
      }
    }

    return detected;
  }

  validateScanner(scanner) {
    if (!scanner || typeof scanner !== "object") {
      throw new TypeError("A valid scanner instance is required.");
    }

    if (
      typeof scanner.id !== "string" ||
      !scanner.id.trim()
    ) {
      throw new Error("A scanner must have a valid ID.");
    }

    if (typeof scanner.scan !== "function") {
      throw new Error(
        `Scanner "${scanner.id}" must implement scan().`
      );
    }

    if (typeof scanner.detect !== "function") {
      throw new Error(
        `Scanner "${scanner.id}" must implement detect().`
      );
    }
  }

  count() {
    this.ensureActive();
    return this.scanners.size;
  }

  async destroyScanner(scanner) {
    if (!scanner || typeof scanner.destroy !== "function") {
      return;
    }

    const existingCleanup = this.cleanupPromises.get(scanner);

    if (existingCleanup) {
      return existingCleanup;
    }

    const cleanupPromise = Promise.resolve().then(() => {
      return scanner.destroy();
    });

    this.cleanupPromises.set(scanner, cleanupPromise);

    try {
      await cleanupPromise;
    } finally {
      if (this.cleanupPromises.get(scanner) === cleanupPromise) {
        this.cleanupPromises.delete(scanner);
      }
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("ScannerRegistry has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyPromise) {
      return this.destroyPromise;
    }

    if (this.destroyed) {
      return Promise.resolve();
    }

    // Immediately prevent new operations.
    this.destroyed = true;

    const scanners = Array.from(this.scanners.values());

    this.scanners.clear();

    this.destroyPromise = (async () => {
      const cleanupResults = await Promise.allSettled(
        scanners.map((scanner) => this.destroyScanner(scanner))
      );

      cleanupResults.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `[RouteLens] Scanner cleanup failed (${scanners[ index ].id}):`,
            result.reason
          );
        }
      });

      this.cleanupPromises.clear();
    })();

    return this.destroyPromise;
  }
}
