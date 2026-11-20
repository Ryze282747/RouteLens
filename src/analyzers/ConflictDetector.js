
export default class ConflictDetector {
  constructor() {
    this.destroyed = false;
  }

  analyze(routes) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    const conflicts = [];
    const seen = new Set();

    for (let i = 0; i < routes.length; i++) {
      const first = routes[ i ];

      if (!this.isValidRoute(first)) {
        continue;
      }

      for (let j = i + 1; j < routes.length; j++) {
        const second = routes[ j ];

        if (!this.isValidRoute(second)) {
          continue;
        }

        const sharedMethods = this.getSharedMethods(
          first.methods,
          second.methods
        );

        if (sharedMethods.length === 0) {
          continue;
        }

        const comparison = this.comparePaths(
          first.path,
          second.path
        );

        if (!comparison.conflict) {
          continue;
        }

        const key = [
          first.id || i,
          second.id || j,
          sharedMethods.join(","),
          comparison.type
        ].join("::");

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);

        conflicts.push({
          id: key,
          type: comparison.type,
          severity: comparison.severity,
          methods: sharedMethods,
          routes: [ first, second ],
          message: comparison.message
        });
      }
    }

    return conflicts;
  }

  comparePaths(firstPath, secondPath) {
    const first = this.normalizePath(firstPath);
    const second = this.normalizePath(secondPath);

    if (first === second) {
      return {
        conflict: true,
        type: "exact",
        severity: "high",
        message: "Both routes use the same path."
      };
    }

    if (
      this.pathsMayOverlap(first, second)
    ) {
      return {
        conflict: true,
        type: "parameter-overlap",
        severity: "medium",
        message: "These routes may match overlapping request paths."
      };
    }

    return {
      conflict: false,
      type: "none",
      severity: "low",
      message: ""
    };
  }

  pathsMayOverlap(firstPath, secondPath) {
    const firstSegments = this.getSegments(firstPath);
    const secondSegments = this.getSegments(secondPath);

    if (firstSegments.length !== secondSegments.length) {
      return false;
    }

    for (let index = 0; index < firstSegments.length; index++) {
      const first = firstSegments[ index ];
      const second = secondSegments[ index ];

      if (first === second) {
        continue;
      }

      if (
        this.isParameter(first) ||
        this.isParameter(second) ||
        this.isWildcard(first) ||
        this.isWildcard(second)
      ) {
        continue;
      }

      return false;
    }

    return true;
  }

  getSharedMethods(firstMethods, secondMethods) {
    const first = this.normalizeMethods(firstMethods);
    const second = this.normalizeMethods(secondMethods);

    return first.filter((method) =>
      second.includes(method)
    );
  }

  normalizeMethods(methods) {
    if (!Array.isArray(methods)) {
      return [];
    }

    return [ ...new Set(
      methods.map((method) =>
        String(method).trim().toUpperCase()
      )
    ) ];
  }

  normalizePath(path) {
    if (typeof path !== "string") {
      return "";
    }

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

  getSegments(path) {
    return this.normalizePath(path)
      .split("/")
      .filter(Boolean);
  }

  isParameter(segment) {
    return (
      /^:[a-zA-Z_]\w*(?:\([^)]*\))?$/.test(segment) ||
      /^<[^>]+>$/.test(segment) ||
      /^\{[^}]+\}$/.test(segment)
    );
  }

  isWildcard(segment) {
    return (
      segment === "*" ||
      segment.startsWith("*") ||
      segment === "**" ||
      segment === "{*}"
    );
  }

  isValidRoute(route) {
    return (
      route &&
      typeof route === "object" &&
      typeof route.path === "string" &&
      Array.isArray(route.methods) &&
      route.methods.length > 0
    );
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("ConflictDetector has been destroyed.");
    }
  }

  destroy() {
    this.destroyed = true;
  }
}
