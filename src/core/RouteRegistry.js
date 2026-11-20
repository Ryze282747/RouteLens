export default class RouteRegistry {
  constructor() {
    this.routes = new Map();
    this.listeners = new Map();
    this.destroyed = false;
  }

  add(route) {
    this.ensureActive();
    this.validate(route);

    const normalizedRoute = this.normalize(route);
    const existing = this.routes.get(normalizedRoute.id);

    this.routes.set(normalizedRoute.id, normalizedRoute);

    if (existing) {
      this.emit("route:updated", normalizedRoute);
    } else {
      this.emit("route:added", normalizedRoute);
    }

    return normalizedRoute;
  }

  addMany(routes = []) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    return routes.map((route) => this.add(route));
  }

  replaceAll(routes = []) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    const normalizedRoutes = routes.map((route) => {
      this.validate(route);
      return this.normalize(route);
    });

    const nextRoutes = new Map();

    for (const route of normalizedRoutes) {
      if (nextRoutes.has(route.id)) {
        throw new Error(
          `Duplicate route ID found during replacement: ${route.id}`
        );
      }

      nextRoutes.set(route.id, route);
    }

    const previousRoutes = Array.from(this.routes.values());
    const previousMap = this.routes;

    // Commit only after the entire replacement has been validated.
    this.routes = nextRoutes;

    for (const previousRoute of previousRoutes) {
      if (!nextRoutes.has(previousRoute.id)) {
        this.emit("route:removed", previousRoute);
      }
    }

    for (const route of nextRoutes.values()) {
      if (previousMap.has(route.id)) {
        this.emit("route:updated", route);
      } else {
        this.emit("route:added", route);
      }
    }

    this.emit("routes:replaced", {
      previousRoutes,
      routes: Array.from(nextRoutes.values())
    });

    return Array.from(nextRoutes.values());
  }

  get(id) {
    this.ensureActive();
    return this.routes.get(id) || null;
  }

  getAll() {
    this.ensureActive();
    return Array.from(this.routes.values());
  }

  find(predicate) {
    this.ensureActive();

    if (typeof predicate !== "function") {
      throw new TypeError("Predicate must be a function.");
    }

    return this.getAll().filter(predicate);
  }

  remove(id) {
    this.ensureActive();

    const route = this.routes.get(id);

    if (!route) {
      return false;
    }

    this.routes.delete(id);
    this.emit("route:removed", route);

    return true;
  }

  removeMany(ids = []) {
    this.ensureActive();

    if (!Array.isArray(ids)) {
      throw new TypeError("Route IDs must be provided as an array.");
    }

    return ids.filter((id) => this.remove(id)).length;
  }

  clear() {
    this.ensureActive();

    const previousRoutes = this.getAll();

    this.routes.clear();

    this.emit("routes:cleared", previousRoutes);

    return previousRoutes.length;
  }

  count() {
    this.ensureActive();
    return this.routes.size;
  }

  subscribe(event, callback) {
    this.ensureActive();

    if (typeof event !== "string" || !event.trim()) {
      throw new TypeError("Event name must be a non-empty string.");
    }

    if (typeof callback !== "function") {
      throw new TypeError("Callback must be a function.");
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

  emit(event, data) {
    const callbacks = this.listeners.get(event);

    if (!callbacks) {
      return;
    }

    for (const callback of [ ...callbacks ]) {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `[RouteLens] Event listener error (${event}):`,
          error
        );
      }
    }
  }

  validate(route) {
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      throw new TypeError("A route must be an object.");
    }

    if (typeof route.path !== "string" || !route.path.trim()) {
      throw new TypeError("A route must have a valid path.");
    }

    if (
      !Array.isArray(route.methods) ||
      route.methods.length === 0
    ) {
      throw new TypeError("A route must have at least one HTTP method.");
    }

    if (typeof route.file !== "string" || !route.file.trim()) {
      throw new TypeError("A route must have a source file.");
    }

    if (
      route.id !== undefined &&
      (typeof route.id !== "string" || !route.id.trim())
    ) {
      throw new TypeError("A route ID must be a non-empty string.");
    }
  }

  normalize(route) {
    const methods = [
      ...new Set(
        route.methods.map((method) =>
          String(method).trim().toUpperCase()
        )
      )
    ].sort();

    return {
      id: route.id || this.createId(route),
      path: route.path.trim(),
      methods,
      file: route.file,
      line: Number.isInteger(route.line) ? route.line : null,
      framework: route.framework || "unknown",
      handler: route.handler || null,
      controller: route.controller || null,
      blueprint: route.blueprint || null,
      router: route.router || null,
      prefix: route.prefix || "",
      metadata: route.metadata || {},
      source: route.source || null
    };
  }

  createId(route) {
    return [
      route.framework || "unknown",
      route.file,
      route.path,
      [ ...route.methods ]
        .map((method) => String(method).trim().toUpperCase())
        .sort()
        .join(","),
      route.line ?? ""
    ].join("::");
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("RouteRegistry has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.routes.clear();
    this.listeners.clear();
    this.destroyed = true;
  }
}
