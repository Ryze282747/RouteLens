
export default class DuplicateRouteDetector {
  constructor() {
    this.destroyed = false;
  }

  analyze(routes) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    const groups = new Map();

    for (const route of routes) {
      if (!this.isValidRoute(route)) {
        continue;
      }

      const path = this.normalizePath(route.path);
      const methods = this.normalizeMethods(route.methods);

      for (const method of methods) {
        const key = `${method} ${path}`;

        if (!groups.has(key)) {
          groups.set(key, []);
        }

        groups.get(key).push(route);
      }
    }

    const duplicates = [];

    for (const [ key, matchingRoutes ] of groups) {
      if (matchingRoutes.length < 2) {
        continue;
      }

      duplicates.push({
        id: key,
        path: this.normalizePath(matchingRoutes[ 0 ].path),
        method: key.split(" ")[ 0 ],
        count: matchingRoutes.length,
        routes: matchingRoutes,
        files: [
          ...new Set(
            matchingRoutes
              .map((route) => route.file)
              .filter(Boolean)
          )
        ],
        message: `${matchingRoutes.length} routes declare the same HTTP method and path.`
      });
    }

    return duplicates;
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

  normalizeMethods(methods) {
    if (!Array.isArray(methods)) {
      return [];
    }

    return [
      ...new Set(
        methods
          .map((method) =>
            String(method).trim().toUpperCase()
          )
          .filter(Boolean)
      )
    ];
  }

  isValidRoute(route) {
    return (
      route &&
      typeof route === "object" &&
      typeof route.path === "string" &&
      route.path.trim().length > 0 &&
      Array.isArray(route.methods) &&
      route.methods.length > 0
    );
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "DuplicateRouteDetector has been destroyed."
      );
    }
  }

  destroy() {
    this.destroyed = true;
  }
}
