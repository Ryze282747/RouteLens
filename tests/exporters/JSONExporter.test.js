import { describe, it, expect, beforeEach } from "vitest";
import JSONExporter from "../../src/exporters/JSONExporter.js";

describe("JSONExporter", () => {
  let exporter;

  const createRoute = (overrides = {}) => ({
    id: "route-1",
    path: "/api/users",
    methods: [ "GET" ],
    framework: "express",
    handler: "getUsers",
    controller: "UserController",
    file: "routes/users.js",
    line: 12,
    blueprint: null,
    router: "userRouter",
    prefix: "/api",
    source: {
      declaration: "router.get('/users', getUsers)"
    },
    metadata: {
      authenticated: true
    },
    ...overrides
  });

  const createData = (overrides = {}) => ({
    project: {
      name: "Example Project",
      root: "/projects/example",
      framework: "express"
    },
    routes: [
      createRoute()
    ],
    duplicates: [],
    conflicts: [],
    frontend: null,
    ...overrides
  });

  const parseExport = async (data, options = {}) => {
    const result = await exporter.export(data, options);
    return JSON.parse(result);
  };

  beforeEach(() => {
    exporter = new JSONExporter();
  });

  describe("Basic export", () => {
    it("should export valid JSON", async () => {
      const result = await exporter.export(createData());

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("should return a JSON string", async () => {
      const result = await exporter.export(createData());

      expect(typeof result).toBe("string");
    });

    it("should include the schema version", async () => {
      const document = await parseExport(createData());

      expect(document.schemaVersion).toBe("1.0.0");
    });

    it("should include generator information", async () => {
      const document = await parseExport(createData());

      expect(document.generator).toEqual({
        name: "RouteLens",
        version: "1.0.0"
      });
    });

    it("should include a generated timestamp", async () => {
      const before = Date.now();
      const document = await parseExport(createData());
      const after = Date.now();

      const timestamp = Date.parse(document.generatedAt);

      expect(Number.isNaN(timestamp)).toBe(false);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("should include project information", async () => {
      const document = await parseExport(createData());

      expect(document.project).toEqual({
        name: "Example Project",
        root: "/projects/example",
        framework: "express"
      });
    });

    it("should include routes", async () => {
      const document = await parseExport(createData());

      expect(document.routes).toHaveLength(1);
      expect(document.routes[ 0 ].path).toBe("/api/users");
    });

    it("should include an analysis section by default", async () => {
      const document = await parseExport(createData());

      expect(document).toHaveProperty("analysis");
    });
  });

  describe("Project normalization", () => {
    it("should return null when project information is missing", async () => {
      const document = await parseExport(
        createData({ project: undefined })
      );

      expect(document.project).toBeNull();
    });

    it("should return null when project is not an object", async () => {
      const document = await parseExport(
        createData({ project: "invalid" })
      );

      expect(document.project).toBeNull();
    });

    it("should return null for an array project value", async () => {
      const document = await parseExport(
        createData({ project: [] })
      );

      expect(document.project).toBeNull();
    });

    it("should normalize missing project properties to null", async () => {
      const document = await parseExport(
        createData({
          project: {
            name: "",
            root: null
          }
        })
      );

      expect(document.project).toEqual({
        name: null,
        root: null,
        framework: null
      });
    });

    it("should trim project text values", async () => {
      const document = await parseExport(
        createData({
          project: {
            name: "  Example  ",
            root: "  /projects/example  ",
            framework: "  flask  "
          }
        })
      );

      expect(document.project).toEqual({
        name: "Example",
        root: "/projects/example",
        framework: "flask"
      });
    });
  });

  describe("Summary", () => {
    it("should count total routes", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute(),
            createRoute({
              id: "route-2",
              path: "/api/products"
            })
          ]
        })
      );

      expect(document.summary.totalRoutes).toBe(2);
    });

    it("should count routes by HTTP method", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              methods: [ "GET" ]
            }),
            createRoute({
              id: "route-2",
              methods: [ "GET" ]
            }),
            createRoute({
              id: "route-3",
              methods: [ "POST" ]
            })
          ]
        })
      );

      expect(document.summary.methods).toEqual({
        GET: 2,
        POST: 1
      });
    });

    it("should normalize HTTP methods in the summary", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              methods: [ "get" ]
            }),
            createRoute({
              id: "route-2",
              methods: [ " post " ]
            })
          ]
        })
      );

      expect(document.summary.methods).toEqual({
        GET: 1,
        POST: 1
      });
    });

    it("should count each method only once per route", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              methods: [ "GET", "GET", "POST" ]
            })
          ]
        })
      );

      expect(document.summary.methods).toEqual({
        GET: 1,
        POST: 1
      });
    });

    it("should count routes by framework", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              framework: "express"
            }),
            createRoute({
              id: "route-2",
              framework: "flask"
            }),
            createRoute({
              id: "route-3",
              framework: "express"
            })
          ]
        })
      );

      expect(document.summary.frameworks).toEqual({
        express: 2,
        flask: 1
      });
    });

    it("should use unknown for missing frameworks", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              framework: undefined
            })
          ]
        })
      );

      expect(document.summary.frameworks).toEqual({
        unknown: 1
      });
    });

    it("should count duplicate and conflict entries", async () => {
      const document = await parseExport(
        createData({
          duplicates: [
            { path: "/users" },
            { path: "/products" }
          ],
          conflicts: [
            { type: "overlap" }
          ]
        })
      );

      expect(document.summary.duplicates).toBe(2);
      expect(document.summary.conflicts).toBe(1);
    });

    it("should use zero counts when analysis arrays are missing", async () => {
      const document = await parseExport(
        createData({
          duplicates: undefined,
          conflicts: undefined
        })
      );

      expect(document.summary.duplicates).toBe(0);
      expect(document.summary.conflicts).toBe(0);
    });

    it("should handle an empty routes array", async () => {
      const document = await parseExport(
        createData({ routes: [] })
      );

      expect(document.summary).toEqual({
        totalRoutes: 0,
        methods: {},
        frameworks: {},
        duplicates: 0,
        conflicts: 0
      });
    });
  });

  describe("Route normalization", () => {
    it("should preserve the route path", async () => {
      const document = await parseExport(createData());

      expect(document.routes[ 0 ].path).toBe("/api/users");
    });

    it("should normalize HTTP methods", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              methods: [ "get", " post ", "GET" ]
            })
          ]
        })
      );

      expect(document.routes[ 0 ].methods).toEqual([
        "GET",
        "POST"
      ]);
    });

    it("should remove duplicate methods", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              methods: [ "GET", "GET", "POST" ]
            })
          ]
        })
      );

      expect(document.routes[ 0 ].methods).toEqual([
        "GET",
        "POST"
      ]);
    });

    it("should filter invalid method values", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              methods: [
                "GET",
                null,
                123,
                "",
                "POST"
              ]
            })
          ]
        })
      );

      expect(document.routes[ 0 ].methods).toEqual([
        "GET",
        "POST"
      ]);
    });

    it("should normalize missing framework to unknown", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              framework: undefined
            })
          ]
        })
      );

      expect(document.routes[ 0 ].framework).toBe("unknown");
    });

    it("should preserve handler and controller information", async () => {
      const document = await parseExport(createData());

      expect(document.routes[ 0 ].handler).toBe("getUsers");
      expect(document.routes[ 0 ].controller).toBe("UserController");
    });

    it("should normalize missing optional text values to null", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              id: "",
              handler: undefined,
              controller: null,
              file: "",
              blueprint: undefined,
              router: null
            })
          ]
        })
      );

      const route = document.routes[ 0 ];

      expect(route.id).toBeNull();
      expect(route.handler).toBeNull();
      expect(route.controller).toBeNull();
      expect(route.source.file).toBeNull();
      expect(route.routing.blueprint).toBeNull();
      expect(route.routing.router).toBeNull();
    });

    it("should normalize the source line", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({ line: 25 })
          ]
        })
      );

      expect(document.routes[ 0 ].source.line).toBe(25);
    });

    it("should reject invalid source line values", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({ line: 0 })
          ]
        })
      );

      expect(document.routes[ 0 ].source.line).toBeNull();
    });

    it("should normalize routing information", async () => {
      const document = await parseExport(createData());

      expect(document.routes[ 0 ].routing).toEqual({
        blueprint: null,
        router: "userRouter",
        prefix: "/api"
      });
    });

    it("should use an empty prefix when missing", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({ prefix: undefined })
          ]
        })
      );

      expect(document.routes[ 0 ].routing.prefix).toBe("");
    });

    it("should preserve source declaration information", async () => {
      const document = await parseExport(createData());

      expect(document.routes[ 0 ].source.declaration).toEqual({
        declaration: "router.get('/users', getUsers)"
      });
    });

    it("should preserve metadata", async () => {
      const document = await parseExport(createData());

      expect(document.routes[ 0 ].metadata).toEqual({
        authenticated: true
      });
    });

    it("should use an empty metadata object when metadata is invalid", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              metadata: null
            })
          ]
        })
      );

      expect(document.routes[ 0 ].metadata).toEqual({});
    });

    it("should use null for invalid source declaration data", async () => {
      const document = await parseExport(
        createData({
          routes: [
            createRoute({
              source: "invalid"
            })
          ]
        })
      );

      expect(document.routes[ 0 ].source.declaration).toBeNull();
    });
  });

  describe("Analysis", () => {
    it("should include duplicate information", async () => {
      const duplicates = [
        {
          method: "GET",
          path: "/users",
          count: 2
        }
      ];

      const document = await parseExport(
        createData({ duplicates })
      );

      expect(document.analysis.duplicates).toEqual(duplicates);
    });

    it("should include conflict information", async () => {
      const conflicts = [
        {
          type: "overlap",
          severity: "warning",
          message: "Potential route overlap"
        }
      ];

      const document = await parseExport(
        createData({ conflicts })
      );

      expect(document.analysis.conflicts).toEqual(conflicts);
    });

    it("should include frontend analysis information", async () => {
      const frontend = {
        matched: 3,
        unmatched: 2
      };

      const document = await parseExport(
        createData({ frontend })
      );

      expect(document.analysis.frontend).toEqual(frontend);
    });

    it("should use empty arrays when duplicate and conflict data is missing", async () => {
      const document = await parseExport(
        createData({
          duplicates: undefined,
          conflicts: undefined
        })
      );

      expect(document.analysis.duplicates).toEqual([]);
      expect(document.analysis.conflicts).toEqual([]);
    });

    it("should use null for invalid frontend analysis data", async () => {
      const document = await parseExport(
        createData({
          frontend: [ "invalid" ]
        })
      );

      expect(document.analysis.frontend).toBeNull();
    });

    it("should omit analysis when includeAnalysis is false", async () => {
      const document = await parseExport(
        createData(),
        { includeAnalysis: false }
      );

      expect(document).not.toHaveProperty("analysis");
    });

    it("should still include analysis when includeAnalysis is true", async () => {
      const document = await parseExport(
        createData(),
        { includeAnalysis: true }
      );

      expect(document).toHaveProperty("analysis");
    });
  });

  describe("Formatting options", () => {
    it("should pretty-print JSON by default", async () => {
      const result = await exporter.export(createData());

      expect(result).toContain("\n");
      expect(result).toContain('  "schemaVersion"');
    });

    it("should produce compact JSON when pretty is false", async () => {
      const result = await exporter.export(
        createData(),
        { pretty: false }
      );

      expect(result).not.toContain("\n");
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("should preserve all data in compact output", async () => {
      const result = await exporter.export(
        createData(),
        { pretty: false }
      );

      const document = JSON.parse(result);

      expect(document.routes).toHaveLength(1);
      expect(document.project.name).toBe("Example Project");
    });
  });

  describe("Validation", () => {
    it("should reject null export data", async () => {
      await expect(
        exporter.export(null)
      ).rejects.toThrow(
        "Export data must be an object."
      );
    });

    it("should reject array export data", async () => {
      await expect(
        exporter.export([])
      ).rejects.toThrow(
        "Export data must be an object."
      );
    });

    it("should reject missing routes", async () => {
      await expect(
        exporter.export({})
      ).rejects.toThrow(
        "Export data must contain a routes array."
      );
    });

    it("should reject non-array routes", async () => {
      await expect(
        exporter.export({
          routes: {}
        })
      ).rejects.toThrow(
        "Export data must contain a routes array."
      );
    });

    it("should reject routes without a path", async () => {
      await expect(
        exporter.export({
          routes: [
            {
              methods: [ "GET" ]
            }
          ]
        })
      ).rejects.toThrow(
        "Export data contains an invalid route."
      );
    });

    it("should reject routes with a non-array methods value", async () => {
      await expect(
        exporter.export({
          routes: [
            {
              path: "/users",
              methods: "GET"
            }
          ]
        })
      ).rejects.toThrow(
        "Export data contains an invalid route."
      );
    });

    it("should reject routes with an empty methods array", async () => {
      await expect(
        exporter.export({
          routes: [
            {
              path: "/users",
              methods: []
            }
          ]
        })
      ).rejects.toThrow(
        "Export data contains an invalid route."
      );
    });

    it("should reject routes with an empty path", async () => {
      await expect(
        exporter.export({
          routes: [
            {
              path: " ",
              methods: [ "GET" ]
            }
          ]
        })
      ).rejects.toThrow(
        "Export data contains an invalid route."
      );
    });

    it("should reject null route entries", async () => {
      await expect(
        exporter.export({
          routes: [ null ]
        })
      ).rejects.toThrow(
        "Export data contains an invalid route."
      );
    });

    it("should reject array route entries", async () => {
      await expect(
        exporter.export({
          routes: [
            [ "/users", "GET" ]
          ]
        })
      ).rejects.toThrow(
        "Export data contains an invalid route."
      );
    });

    it("should reject null export options", async () => {
      await expect(
        exporter.export(createData(), null)
      ).rejects.toThrow(
        "Export options must be an object."
      );
    });

    it("should reject array export options", async () => {
      await expect(
        exporter.export(createData(), [])
      ).rejects.toThrow(
        "Export options must be an object."
      );
    });
  });

  describe("Lifecycle", () => {
    it("should initialize as active", () => {
      expect(exporter.destroyed).toBe(false);
    });

    it("should destroy the exporter", () => {
      exporter.destroy();

      expect(exporter.destroyed).toBe(true);
    });

    it("should reject exports after destruction", async () => {
      exporter.destroy();

      await expect(
        exporter.export(createData())
      ).rejects.toThrow(
        "JSONExporter has been destroyed."
      );
    });

    it("should allow repeated destruction", () => {
      exporter.destroy();
      exporter.destroy();

      expect(exporter.destroyed).toBe(true);
    });
  });
});