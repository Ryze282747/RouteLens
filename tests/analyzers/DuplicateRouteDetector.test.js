
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import DuplicateRouteDetector from "../../src/analyzers/DuplicateRouteDetector.js";

describe("DuplicateRouteDetector", () => {
  let detector;

  const createRoute = (overrides = {}) => ({
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    file: "/project/routes/users.js",
    ...overrides
  });

  beforeEach(() => {
    detector = new DuplicateRouteDetector();
  });

  afterEach(() => {
    if (!detector.destroyed) {
      detector.destroy();
    }
  });

  describe("constructor", () => {
    it("should initialize without being destroyed", () => {
      expect(detector.destroyed).toBe(false);
    });
  });

  describe("analyze()", () => {
    it("should reject non-array input", () => {
      expect(() => detector.analyze(null)).toThrow(
        "Routes must be provided as an array."
      );

      expect(() => detector.analyze({})).toThrow(
        "Routes must be provided as an array."
      );

      expect(() => detector.analyze("routes")).toThrow(
        "Routes must be provided as an array."
      );
    });

    it("should return an empty array for empty input", () => {
      expect(detector.analyze([])).toEqual([]);
    });

    it("should return an empty array for a single route", () => {
      expect(
        detector.analyze([ createRoute() ])
      ).toEqual([]);
    });

    it("should detect exact duplicate routes", () => {
      const first = createRoute({
        id: "route-1"
      });

      const second = createRoute({
        id: "route-2"
      });

      const result = detector.analyze([ first, second ]);

      expect(result).toHaveLength(1);
      expect(result[ 0 ]).toEqual({
        id: "GET /users",
        path: "/users",
        method: "GET",
        count: 2,
        routes: [ first, second ],
        files: [
          "/project/routes/users.js"
        ],
        message: "2 routes declare the same HTTP method and path."
      });
    });

    it("should detect duplicates across different files", () => {
      const first = createRoute({
        id: "route-1",
        file: "/project/routes/users.js"
      });

      const second = createRoute({
        id: "route-2",
        file: "/project/routes/admin.js"
      });

      const result = detector.analyze([ first, second ]);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].files).toEqual([
        "/project/routes/users.js",
        "/project/routes/admin.js"
      ]);
    });

    it("should group three or more duplicate routes", () => {
      const routes = [
        createRoute({ id: "route-1" }),
        createRoute({ id: "route-2" }),
        createRoute({ id: "route-3" })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].count).toBe(3);
      expect(result[ 0 ].routes).toEqual(routes);
      expect(result[ 0 ].message).toBe(
        "3 routes declare the same HTTP method and path."
      );
    });

    it("should detect duplicates independently for different methods", () => {
      const routes = [
        createRoute({
          id: "route-1",
          methods: [ "GET", "POST" ]
        }),
        createRoute({
          id: "route-2",
          methods: [ "GET", "POST" ]
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.method)).toEqual([
        "GET",
        "POST"
      ]);
    });

    it("should not report duplicates for different methods", () => {
      const routes = [
        createRoute({
          id: "route-1",
          methods: [ "GET" ]
        }),
        createRoute({
          id: "route-2",
          methods: [ "POST" ]
        })
      ];

      expect(detector.analyze(routes)).toEqual([]);
    });

    it("should normalize method casing", () => {
      const routes = [
        createRoute({
          id: "route-1",
          methods: [ "get" ]
        }),
        createRoute({
          id: "route-2",
          methods: [ "GET" ]
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].method).toBe("GET");
    });

    it("should trim whitespace from methods", () => {
      const routes = [
        createRoute({
          id: "route-1",
          methods: [ " GET " ]
        }),
        createRoute({
          id: "route-2",
          methods: [ "GET" ]
        })
      ];

      expect(detector.analyze(routes)).toHaveLength(1);
    });

    it("should remove duplicate methods within a route", () => {
      const routes = [
        createRoute({
          id: "route-1",
          methods: [ "GET", "GET", "POST" ]
        }),
        createRoute({
          id: "route-2",
          methods: [ "GET", "POST" ]
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.method)).toEqual([
        "GET",
        "POST"
      ]);
    });

    it("should detect duplicates after path normalization", () => {
      const routes = [
        createRoute({
          id: "route-1",
          path: "users/"
        }),
        createRoute({
          id: "route-2",
          path: "/users"
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].path).toBe("/users");
    });

    it("should normalize repeated slashes", () => {
      const routes = [
        createRoute({
          id: "route-1",
          path: "/users///profile"
        }),
        createRoute({
          id: "route-2",
          path: "/users/profile"
        })
      ];

      expect(detector.analyze(routes)).toHaveLength(1);
    });

    it("should normalize backslashes", () => {
      const routes = [
        createRoute({
          id: "route-1",
          path: "\\users\\profile"
        }),
        createRoute({
          id: "route-2",
          path: "/users/profile"
        })
      ];

      expect(detector.analyze(routes)).toHaveLength(1);
    });

    it("should preserve root paths", () => {
      const routes = [
        createRoute({
          id: "route-1",
          path: "/"
        }),
        createRoute({
          id: "route-2",
          path: "/"
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].path).toBe("/");
    });

    it("should preserve parameterized paths as exact path keys", () => {
      const routes = [
        createRoute({
          id: "route-1",
          path: "/users/:id"
        }),
        createRoute({
          id: "route-2",
          path: "/users/:id"
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].path).toBe("/users/:id");
    });

    it("should not treat different parameter names as exact duplicates", () => {
      const routes = [
        createRoute({
          id: "route-1",
          path: "/users/:id"
        }),
        createRoute({
          id: "route-2",
          path: "/users/:userId"
        })
      ];

      expect(detector.analyze(routes)).toEqual([]);
    });

    it("should detect multiple independent duplicate groups", () => {
      const routes = [
        createRoute({
          id: "route-1",
          path: "/users"
        }),
        createRoute({
          id: "route-2",
          path: "/users"
        }),
        createRoute({
          id: "route-3",
          path: "/products"
        }),
        createRoute({
          id: "route-4",
          path: "/products"
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(2);
      expect(result[ 0 ].path).toBe("/users");
      expect(result[ 1 ].path).toBe("/products");
    });

    it("should preserve original route references", () => {
      const first = createRoute({
        id: "route-1"
      });

      const second = createRoute({
        id: "route-2"
      });

      const result = detector.analyze([ first, second ]);

      expect(result[ 0 ].routes[ 0 ]).toBe(first);
      expect(result[ 0 ].routes[ 1 ]).toBe(second);
    });

    it("should remove duplicate file paths", () => {
      const routes = [
        createRoute({
          id: "route-1",
          file: "/project/routes/users.js"
        }),
        createRoute({
          id: "route-2",
          file: "/project/routes/users.js"
        }),
        createRoute({
          id: "route-3",
          file: "/project/routes/admin.js"
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].files).toEqual([
        "/project/routes/users.js",
        "/project/routes/admin.js"
      ]);
    });

    it("should exclude missing and empty file paths", () => {
      const routes = [
        createRoute({
          id: "route-1",
          file: "/project/routes/users.js"
        }),
        createRoute({
          id: "route-2",
          file: ""
        }),
        createRoute({
          id: "route-3",
          file: null
        })
      ];

      const result = detector.analyze(routes);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].files).toEqual([
        "/project/routes/users.js"
      ]);
    });

    it("should ignore null and undefined routes", () => {
      const result = detector.analyze([
        null,
        undefined,
        createRoute()
      ]);

      expect(result).toEqual([]);
    });

    it("should ignore primitive route values", () => {
      expect(
        detector.analyze([
          "route",
          123,
          true,
          createRoute()
        ])
      ).toEqual([]);
    });

    it("should ignore arrays as route objects", () => {
      expect(
        detector.analyze([
          [],
          createRoute()
        ])
      ).toEqual([]);
    });

    it("should ignore routes without string paths", () => {
      expect(
        detector.analyze([
          createRoute({ path: 123 }),
          createRoute({ path: "/users" })
        ])
      ).toEqual([]);
    });

    it("should ignore routes with empty paths", () => {
      expect(
        detector.analyze([
          createRoute({ path: "" }),
          createRoute({ path: "/users" })
        ])
      ).toEqual([]);
    });

    it("should ignore routes with whitespace-only paths", () => {
      expect(
        detector.analyze([
          createRoute({ path: "   " }),
          createRoute({ path: "/users" })
        ])
      ).toEqual([]);
    });

    it("should ignore routes without methods arrays", () => {
      expect(
        detector.analyze([
          createRoute({ methods: "GET" }),
          createRoute({ methods: [ "GET" ] })
        ])
      ).toEqual([]);
    });

    it("should ignore routes with empty methods arrays", () => {
      expect(
        detector.analyze([
          createRoute({ methods: [] }),
          createRoute({ methods: [ "GET" ] })
        ])
      ).toEqual([]);
    });

    it("should ignore routes with unsupported methods only when no matching method exists", () => {
      const result = detector.analyze([
        createRoute({
          id: "route-1",
          methods: [ "CUSTOM" ]
        }),
        createRoute({
          id: "route-2",
          methods: [ "INVALID" ]
        })
      ]);

      expect(result).toEqual([]);
    });
  });

  describe("normalizePath()", () => {
    it("should add a leading slash", () => {
      expect(
        detector.normalizePath("users")
      ).toBe("/users");
    });

    it("should trim surrounding whitespace", () => {
      expect(
        detector.normalizePath("  /users  ")
      ).toBe("/users");
    });

    it("should replace backslashes", () => {
      expect(
        detector.normalizePath("\\users\\profile")
      ).toBe("/users/profile");
    });

    it("should collapse repeated slashes", () => {
      expect(
        detector.normalizePath("/users///profile")
      ).toBe("/users/profile");
    });

    it("should remove trailing slashes", () => {
      expect(
        detector.normalizePath("/users/profile///")
      ).toBe("/users/profile");
    });

    it("should preserve root paths", () => {
      expect(
        detector.normalizePath("/")
      ).toBe("/");
    });

    it("should normalize repeated root slashes", () => {
      expect(
        detector.normalizePath("////")
      ).toBe("/");
    });

    it("should normalize whitespace-only paths to root", () => {
      expect(
        detector.normalizePath("   ")
      ).toBe("/");
    });
  });

  describe("normalizeMethods()", () => {
    it("should uppercase and trim methods", () => {
      expect(
        detector.normalizeMethods([ " get ", "post" ])
      ).toEqual([ "GET", "POST" ]);
    });

    it("should remove duplicate methods", () => {
      expect(
        detector.normalizeMethods([ "GET", "GET", "POST" ])
      ).toEqual([ "GET", "POST" ]);
    });

    it("should preserve method order", () => {
      expect(
        detector.normalizeMethods([ "POST", "GET", "DELETE" ])
      ).toEqual([ "POST", "GET", "DELETE" ]);
    });

    it("should remove empty normalized values", () => {
      expect(
        detector.normalizeMethods([ "", " ", "GET" ])
      ).toEqual([ "GET" ]);
    });

    it("should convert values to strings", () => {
      expect(
        detector.normalizeMethods([ null, 123, "GET" ])
      ).toEqual([ "NULL", "123", "GET" ]);
    });

    it("should return an empty array for non-array input", () => {
      expect(detector.normalizeMethods(null)).toEqual([]);
      expect(detector.normalizeMethods("GET")).toEqual([]);
      expect(detector.normalizeMethods({})).toEqual([]);
    });

    it("should return an empty array for an empty array", () => {
      expect(detector.normalizeMethods([])).toEqual([]);
    });
  });

  describe("isValidRoute()", () => {
    it("should accept a valid route", () => {
      expect(
        detector.isValidRoute(createRoute())
      ).toBe(true);
    });

    it("should reject null", () => {
      expect(detector.isValidRoute(null)).toBeFalsy();
    });

    it("should reject primitive values", () => {
      expect(detector.isValidRoute("route")).toBe(false);
      expect(detector.isValidRoute(123)).toBe(false);
    });

    it("should reject arrays", () => {
      expect(detector.isValidRoute([])).toBe(false);
    });

    it("should reject routes with non-string paths", () => {
      expect(
        detector.isValidRoute(createRoute({
          path: 123
        }))
      ).toBe(false);
    });

    it("should reject routes with empty paths", () => {
      expect(
        detector.isValidRoute(createRoute({
          path: ""
        }))
      ).toBe(false);
    });

    it("should reject routes with whitespace-only paths", () => {
      expect(
        detector.isValidRoute(createRoute({
          path: "   "
        }))
      ).toBe(false);
    });

    it("should reject routes without methods arrays", () => {
      expect(
        detector.isValidRoute(createRoute({
          methods: "GET"
        }))
      ).toBe(false);
    });

    it("should reject routes with empty methods arrays", () => {
      expect(
        detector.isValidRoute(createRoute({
          methods: []
        }))
      ).toBe(false);
    });

    it("should accept routes without IDs", () => {
      expect(
        detector.isValidRoute({
          path: "/users",
          methods: [ "GET" ]
        })
      ).toBe(true);
    });
  });

  describe("lifecycle", () => {
    it("should mark the detector as destroyed", () => {
      detector.destroy();

      expect(detector.destroyed).toBe(true);
    });

    it("should allow destroy() to be called more than once", () => {
      detector.destroy();

      expect(() => detector.destroy()).not.toThrow();
    });

    it("should throw when analyze() is called after destruction", () => {
      detector.destroy();

      expect(() => detector.analyze([])).toThrow(
        "DuplicateRouteDetector has been destroyed."
      );
    });
  });
});
