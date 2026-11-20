
export default class FrontendMatcher {
  constructor() {
    this.destroyed = false;

    this.httpMethods = new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD"
    ]);
  }

  analyze(frontendCalls, backendRoutes) {
    this.ensureActive();

    if (!Array.isArray(frontendCalls)) {
      throw new TypeError(
        "Frontend API calls must be provided as an array."
      );
    }

    if (!Array.isArray(backendRoutes)) {
      throw new TypeError(
        "Backend routes must be provided as an array."
      );
    }

    const matches = [];
    const unmatched = [];
    const ambiguous = [];

    for (const call of frontendCalls) {
      this.ensureActive();

      if (!this.isValidCall(call)) {
        continue;
      }

      const normalizedCall = this.normalizeCall(call);

      const candidates = backendRoutes.filter((route) =>
        this.isValidRoute(route) &&
        this.methodsMatch(normalizedCall.method, route.methods) &&
        this.pathsMatch(normalizedCall.path, route.path)
      );

      if (candidates.length === 0) {
        unmatched.push({
          ...normalizedCall,
          status: "unmatched",
          message: "No matching backend route was found."
        });

        continue;
      }

      if (candidates.length > 1) {
        ambiguous.push({
          ...normalizedCall,
          status: "ambiguous",
          candidates,
          message: "Multiple backend routes may match this API call."
        });

        continue;
      }

      matches.push({
        ...normalizedCall,
        status: "matched",
        route: candidates[ 0 ]
      });
    }

    return {
      total: frontendCalls.length,
      matched: matches.length,
      unmatched: unmatched.length,
      ambiguous: ambiguous.length,
      matches,
      unmatchedCalls: unmatched,
      ambiguousCalls: ambiguous
    };
  }

  normalizeCall(call) {
    return {
      ...call,
      method: String(call.method || "GET")
        .trim()
        .toUpperCase(),
      path: this.normalizePath(call.path)
    };
  }

  methodsMatch(frontendMethod, backendMethods) {
    if (!Array.isArray(backendMethods)) {
      return false;
    }

    const method = String(frontendMethod)
      .trim()
      .toUpperCase();

    return backendMethods.some((backendMethod) => {
      const normalized = String(backendMethod)
        .trim()
        .toUpperCase();

      return normalized === method;
    });
  }

  pathsMatch(frontendPath, backendPath) {
    const frontend = this.normalizePath(frontendPath);
    const backend = this.normalizePath(backendPath);

    if (frontend === backend) {
      return true;
    }

    const frontendSegments = this.getSegments(frontend);
    const backendSegments = this.getSegments(backend);

    if (frontendSegments.length !== backendSegments.length) {
      return false;
    }

    for (
      let index = 0;
      index < frontendSegments.length;
      index++
    ) {
      const frontendSegment = frontendSegments[ index ];
      const backendSegment = backendSegments[ index ];

      if (frontendSegment === backendSegment) {
        continue;
      }

      if (this.isBackendParameter(backendSegment)) {
        continue;
      }

      return false;
    }

    return true;
  }

  isBackendParameter(segment) {
    return (
      /^:[a-zA-Z_]\w*(?:\([^)]*\))?$/.test(segment) ||
      /^<[^>]+>$/.test(segment) ||
      /^\{[^}]+\}$/.test(segment) ||
      segment === "*" ||
      segment.startsWith("*")
    );
  }

  getSegments(path) {
    return path
      .split("/")
      .filter(Boolean);
  }

  normalizePath(path) {
    if (typeof path !== "string") {
      return "";
    }

    let normalized = path.trim();

    // Preserve backslashes inside parameter patterns.
    // Normalize Windows-style separators outside parameters.
    normalized = normalized.replace(
      /(:[a-zA-Z_]\w*\([^)]*\))|\\/g,
      (match, parameter) => parameter || "/"
    );

    // Remove query strings and fragments from URL-like paths.
    normalized = normalized.split(/[?#]/, 1)[ 0 ];

    if (!normalized.startsWith("/")) {
      normalized = `/${normalized}`;
    }

    normalized = normalized.replace(/\/+/g, "/");

    if (normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, "");
    }

    return normalized;
  }

  isValidCall(call) {
    return (
      call &&
      typeof call === "object" &&
      typeof call.path === "string" &&
      call.path.trim().length > 0 &&
      (
        call.method === undefined ||
        call.method === null ||
        typeof call.method === "string"
      )
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
      throw new Error("FrontendMatcher has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.httpMethods.clear();
    this.destroyed = true;
  }
}
