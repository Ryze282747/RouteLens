export default class JSONExporter {
  constructor() {
    this.destroyed = false;
  }

  async export(data, options = {}) {
    this.ensureActive();
    this.validateData(data);
    this.validateOptions(options);

    const document = {
      schemaVersion: "1.0.0",
      generator: {
        name: "RouteLens",
        version: "1.0.0"
      },
      generatedAt: new Date().toISOString(),
      project: this.normalizeProject(data.project),
      summary: this.createSummary(data),
      routes: data.routes.map((route) =>
        this.normalizeRoute(route)
      )
    };

    if (options.includeAnalysis !== false) {
      document.analysis = this.normalizeAnalysis(data);
    }

    return JSON.stringify(
      document,
      null,
      options.pretty === false ? 0 : 2
    );
  }

  normalizeProject(project) {
    if (
      !project ||
      typeof project !== "object" ||
      Array.isArray(project)
    ) {
      return null;
    }

    return {
      name: this.normalizeNullableText(project.name),
      root: this.normalizeNullableText(project.root),
      framework: this.normalizeNullableText(project.framework)
    };
  }

  createSummary(data) {
    const routes = data.routes;
    const methods = new Map();
    const frameworks = new Map();

    for (const route of routes) {
      const routeMethods = new Set(
        route.methods
          .map((method) => this.normalizeMethod(method))
          .filter(Boolean)
      );

      for (const method of routeMethods) {
        methods.set(
          method,
          (methods.get(method) || 0) + 1
        );
      }

      const framework = this.normalizeText(
        route.framework,
        "unknown"
      );

      frameworks.set(
        framework,
        (frameworks.get(framework) || 0) + 1
      );
    }

    return {
      totalRoutes: routes.length,
      methods: Object.fromEntries(
        [ ...methods.entries() ].sort(([ first ], [ second ]) =>
          first.localeCompare(second)
        )
      ),
      frameworks: Object.fromEntries(
        [ ...frameworks.entries() ].sort(([ first ], [ second ]) =>
          first.localeCompare(second)
        )
      ),
      duplicates: Array.isArray(data.duplicates)
        ? data.duplicates.length
        : 0,
      conflicts: Array.isArray(data.conflicts)
        ? data.conflicts.length
        : 0
    };
  }

  normalizeRoute(route) {
    return {
      id: this.normalizeNullableText(route.id),
      path: route.path,
      methods: [
        ...new Set(
          route.methods
            .map((method) => this.normalizeMethod(method))
            .filter(Boolean)
        )
      ],
      framework: this.normalizeText(
        route.framework,
        "unknown"
      ),
      handler: this.normalizeNullableText(route.handler),
      controller: this.normalizeNullableText(route.controller),
      source: {
        file: this.normalizeNullableText(route.file),
        line: this.normalizeLine(route.line),
        declaration: this.normalizeObject(route.source)
      },
      routing: {
        blueprint: this.normalizeNullableText(route.blueprint),
        router: this.normalizeNullableText(route.router),
        prefix: this.normalizeText(route.prefix, "")
      },
      metadata: this.normalizeObject(route.metadata) || {}
    };
  }

  normalizeAnalysis(data) {
    return {
      duplicates: this.normalizeArray(data.duplicates),
      conflicts: this.normalizeArray(data.conflicts),
      frontend: this.normalizeObject(data.frontend)
    };
  }

  normalizeArray(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return this.cloneJSONSafe(value);
  }

  normalizeMethod(method) {
    if (typeof method !== "string") {
      return "";
    }

    return method.trim().toUpperCase();
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

  normalizeLine(line) {
    return Number.isInteger(line) && line > 0
      ? line
      : null;
  }

  normalizeObject(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return null;
    }

    return this.cloneJSONSafe(value);
  }

  cloneJSONSafe(value, ancestors = new WeakSet()) {
    if (value === null) {
      return null;
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (
      typeof value === "undefined" ||
      typeof value === "function" ||
      typeof value === "symbol"
    ) {
      return undefined;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? null
        : value.toISOString();
    }

    if (typeof value !== "object") {
      return null;
    }

    if (ancestors.has(value)) {
      return "[Circular]";
    }

    ancestors.add(value);

    let result;

    if (Array.isArray(value)) {
      result = value.map((item) => {
        const cloned = this.cloneJSONSafe(item, ancestors);

        return cloned === undefined ? null : cloned;
      });
    } else {
      result = {};

      for (const key of Object.keys(value)) {
        let propertyValue;

        try {
          propertyValue = value[ key ];
        } catch {
          continue;
        }

        const cloned = this.cloneJSONSafe(
          propertyValue,
          ancestors
        );

        if (cloned === undefined) {
          continue;
        }

        Object.defineProperty(result, key, {
          value: cloned,
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
    }

    ancestors.delete(value);

    return result;
  }

  validateData(data) {
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      throw new TypeError(
        "Export data must be an object."
      );
    }

    if (!Array.isArray(data.routes)) {
      throw new TypeError(
        "Export data must contain a routes array."
      );
    }

    for (const route of data.routes) {
      if (
        !route ||
        typeof route !== "object" ||
        Array.isArray(route) ||
        typeof route.path !== "string" ||
        !route.path.trim() ||
        !Array.isArray(route.methods) ||
        route.methods.length === 0
      ) {
        throw new TypeError(
          "Export data contains an invalid route."
        );
      }

      const hasValidMethod = route.methods.some(
        (method) => Boolean(this.normalizeMethod(method))
      );

      if (!hasValidMethod) {
        throw new TypeError(
          "Export data contains an invalid route."
        );
      }
    }
  }

  validateOptions(options) {
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options)
    ) {
      throw new TypeError(
        "Export options must be an object."
      );
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "JSONExporter has been destroyed."
      );
    }
  }

  destroy() {
    this.destroyed = true;
  }
}
