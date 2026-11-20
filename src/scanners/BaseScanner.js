
export default class BaseScanner {
  constructor({ id, name, framework, extensions = [] } = {}) {
    if (!id || typeof id !== "string") {
      throw new TypeError("Scanner ID is required.");
    }

    if (!name || typeof name !== "string") {
      throw new TypeError("Scanner name is required.");
    }

    if (!framework || typeof framework !== "string") {
      throw new TypeError("Scanner framework is required.");
    }

    this.id = id;
    this.name = name;
    this.framework = framework;
    this.extensions = extensions;

    this.destroyed = false;
  }

  async detect() {
    this.ensureActive();

    throw new Error(
      `${this.name} must implement the detect() method.`
    );
  }

  async scan() {
    this.ensureActive();

    throw new Error(
      `${this.name} must implement the scan() method.`
    );
  }

  supportsExtension(filePath) {
    this.ensureActive();

    if (typeof filePath !== "string") {
      return false;
    }

    const extension = filePath
      .split(".")
      .pop()
      .toLowerCase();

    return this.extensions.includes(`.${extension}`);
  }

  createRoute(data) {
    this.ensureActive();

    if (!data || typeof data !== "object") {
      throw new TypeError("Route data must be an object.");
    }

    return {
      ...data,
      framework: this.framework
    };
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(`${this.name} has been destroyed.`);
    }
  }

  destroy() {
    this.destroyed = true;
  }
}
