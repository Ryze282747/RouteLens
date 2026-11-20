
export default class RouteNormalizer {
  constructor() {
    this.destroyed = false;

    this.validMethods = new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD",
      "TRACE",
      "CONNECT"
    ]);
  }

  normalize(route) {
    this.ensureActive();
    this.validate(route);

    const methods = this.normalizeMethods(route.methods);

    return {
      id: this.normalizeId(route.id),
      path: this.normalizePath(route.path),
      methods,
      framework: this.normalizeText(
        route.framework,
        "unknown"
      ),
      file: this.normalizeText(route.file, ""),
      line: this.normalizeLine(route.line),
      handler: this.normalizeNullableText(route.handler),
      controller: this.normalizeNullableText(route.controller),
      blueprint: this.normalizeNullableText(route.blueprint),
      router: this.normalizeNullableText(route.router),
      prefix: this.normalizeText(route.prefix, ""),
      metadata: this.normalizeMetadata(route.metadata),
      source: this.normalizeSource(route.source)
    };
  }

  normalizeMany(routes) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    return routes.map((route) => this.normalize(route));
  }

  validate(route) {
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      throw new TypeError("A route must be an object.");
    }

    if (
      typeof route.path !== "string" ||
      !route.path.trim()
    ) {
      throw new TypeError("A route must have a valid path.");
    }

    if (
      !Array.isArray(route.methods) ||
      route.methods.length === 0
    ) {
      throw new TypeError(
        "A route must contain at least one HTTP method."
      );
    }

    if (
      typeof route.file !== "string" ||
      !route.file.trim()
    ) {
      throw new TypeError("A route must have a source file.");
    }
  }

  normalizeMethods(methods) {
    const normalized = methods
      .map((method) => String(method).trim().toUpperCase())
      .filter((method) => this.validMethods.has(method));

    return [ ...new Set(normalized) ].sort();
  }

  normalizePath(path) {
    let normalized = path.trim().replace(/\\/g, "/");

    if (!normalized.startsWith("/")) {
      normalized = `/${normalized}`;
    }

    normalized = normalized.replace(/\/+/g, "/");

    if (normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, "");
    }

    return normalized;
  }

  normalizeId(id) {
    if (typeof id === "string" && id.trim()) {
      return id.trim();
    }

    return null;
  }

  normalizeLine(line) {
    return Number.isInteger(line) && line > 0
      ? line
      : null;
  }

  normalizeText(value, fallback = "") {
    return typeof value === "string" && value.trim()
      ? value.trim()
      : fallback;
  }

  normalizeNullableText(value) {
    return typeof value === "string" && value.trim()
      ? value.trim()
      : null;
  }

  normalizeMetadata(metadata) {
    if (
      !metadata ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    ) {
      return {};
    }

    return { ...metadata };
  }

  normalizeSource(source) {
    if (
      !source ||
      typeof source !== "object" ||
      Array.isArray(source)
    ) {
      return null;
    }

    return { ...source };
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("RouteNormalizer has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.validMethods.clear();
    this.destroyed = true;
  }
}
