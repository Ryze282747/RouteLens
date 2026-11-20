import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import ConflictDetector from "../../src/analyzers/ConflictDetector.js";

describe("ConflictDetector", () => {
  let detector;

  const createRoute = (overrides = {}) => ({
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    ...overrides
  });

  beforeEach(() => {
    detector = new ConflictDetector();
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

    it("should return an empty array for no routes", () => {
      expect(detector.analyze([])).toEqual([]);
    });

    it("should return an empty array for a single route", () => {
      expect(
        detector.analyze([
          createRoute()
        ])
      ).toEqual([]);
    });

    it("should detect exact path conflicts", () => {
      const first = createRoute({
        id: "route-1",
        path: "/users"
      });

      const second = createRoute({
        id: "route-2",
        path: "/users"
      });

      const result = detector.analyze([ first, second ]);

      expect(result).toHaveLength(1);
      expect(result[ 0 ]).toMatchObject({
        type: "exact",
        severity: "high",
        methods: [ "GET" ],
        routes: [ first, second ],
        message: "Both routes use the same path."
      });
    });

    it("should detect parameter-overlap conflicts", () => {
      const first = createRoute({
        id: "route-1",
        path: "/users/:id"
      });

      const second = createRoute({
        id: "route-2",
        path: "/users/profile"
      });

      const result = detector.analyze([ first, second ]);

      expect(result).toHaveLength(1);
      expect(result[ 0 ]).toMatchObject({
        type: "parameter-overlap",
        severity: "medium",
        methods: [ "GET" ],
        routes: [ first, second ],
        message: "These routes may match overlapping request paths."
      });
    });

    it("should not report conflicts when HTTP methods do not overlap", () => {
      const first = createRoute({
        id: "route-1",
        path: "/users",
        methods: [ "GET" ]
      });

      const second = createRoute({
        id: "route-2",
        path: "/users",
        methods: [ "POST" ]
      });

      expect(
        detector.analyze([ first, second ])
      ).toEqual([]);
    });

    it("should report only shared HTTP methods", () => {
      const first = createRoute({
        id: "route-1",
        path: "/users",
        methods: [ "GET", "POST", "PUT" ]
      });

      const second = createRoute({
        id: "route-2",
        path: "/users",
        methods: [ "POST", "DELETE", "GET" ]
      });

      const result = detector.analyze([ first, second ]);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].methods).toEqual([ "GET", "POST" ]);
    });

    it("should ignore invalid route objects", () => {
      const valid = createRoute({
        id: "valid",
        path: "/users"
      });

      const result = detector.analyze([
        null,
        undefined,
        "invalid",
        123,
        [],
        {},
        valid
      ]);

      expect(result).toEqual([]);
    });

    it("should ignore routes without a string path", () => {
      const result = detector.analyze([
        createRoute({
          id: "route-1",
          path: 123
        }),
        createRoute({
          id: "route-2",
          path: "/users"
        })
      ]);

      expect(result).toEqual([]);
    });

    it("should ignore routes without a methods array", () => {
      const result = detector.analyze([
        createRoute({
          id: "route-1",
          methods: "GET"
        }),
        createRoute({
          id: "route-2",
          methods: [ "GET" ]
        })
      ]);

      expect(result).toEqual([]);
    });

    it("should ignore routes with empty methods arrays", () => {
      const result = detector.analyze([
        createRoute({
          id: "route-1",
          methods: []
        }),
        createRoute({
          id: "route-2",
          methods: [ "GET" ]
        })
      ]);

      expect(result).toEqual([]);
    });

    it("should detect multiple independent conflicts", () => {
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
      expect(result[ 0 ].routes).toEqual([
        routes[ 0 ],
        routes[ 1 ]
      ]);
      expect(result[ 1 ].routes).toEqual([
        routes[ 2 ],
        routes[ 3 ]
      ]);
    });

    it("should detect conflicts across different parameter names", () => {
      const result = detector.analyze([
        createRoute({
          id: "route-1",
          path: "/users/:id"
        }),
        createRoute({
          id: "route-2",
          path: "/users/:userId"
        })
      ]);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].type).toBe("parameter-overlap");
    });

    it("should preserve route object references in conflict results", () => {
      const first = createRoute({
        id: "route-1",
        path: "/users"
      });

      const second = createRoute({
        id: "route-2",
        path: "/users"
      });

      const result = detector.analyze([ first, second ]);

      expect(result[ 0 ].routes[ 0 ]).toBe(first);
      expect(result[ 0 ].routes[ 1 ]).toBe(second);
    });

    it("should generate a conflict ID from route IDs and comparison data", () => {
      const result = detector.analyze([
        createRoute({
          id: "first",
          path: "/users"
        }),
        createRoute({
          id: "second",
          path: "/users"
        })
      ]);

      expect(result[ 0 ].id).toBe(
        "first::second::GET::exact"
      );
    });

    it("should use route indexes when IDs are missing", () => {
      const result = detector.analyze([
        createRoute({
          id: null,
          path: "/users"
        }),
        createRoute({
          id: undefined,
          path: "/users"
        })
      ]);

      expect(result[ 0 ].id).toBe(
        "0::1::GET::exact"
      );
    });

    it("should normalize method casing before comparing routes", () => {
      const result = detector.analyze([
        createRoute({
          id: "route-1",
          path: "/users",
          methods: [ "get" ]
        }),
        createRoute({
          id: "route-2",
          path: "/users",
          methods: [ "GET" ]
        })
      ]);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].methods).toEqual([ "GET" ]);
    });

    it("should normalize whitespace in methods", () => {
      const result = detector.analyze([
        createRoute({
          id: "route-1",
          path: "/users",
          methods: [ " GET " ]
        }),
        createRoute({
          id: "route-2",
          path: "/users",
          methods: [ "GET" ]
        })
      ]);

      expect(result).toHaveLength(1);
    });

    it("should remove duplicate methods when comparing", () => {
      const result = detector.analyze([
        createRoute({
          id: "route-1",
          path: "/users",
          methods: [ "GET", "GET" ]
        }),
        createRoute({
          id: "route-2",
          path: "/users",
          methods: [ "GET" ]
        })
      ]);

      expect(result).toHaveLength(1);
      expect(result[ 0 ].methods).toEqual([ "GET" ]);
    });

    it("should not report conflicts for unrelated paths", () => {
      expect(
        detector.analyze([
          createRoute({
            id: "route-1",
            path: "/users"
          }),
          createRoute({
            id: "route-2",
            path: "/products"
          })
        ])
      ).toEqual([]);
    });

    it("should not report paths with different segment counts as overlapping", () => {
      expect(
        detector.analyze([
          createRoute({
            id: "route-1",
            path: "/users/:id"
          }),
          createRoute({
            id: "route-2",
            path: "/users/:id/posts"
          })
        ])
      ).toEqual([]);
    });

    it("should not report conflicts when all shared method values normalize to different strings", () => {
      expect(
        detector.analyze([
          createRoute({
            id: "route-1",
            path: "/users",
            methods: [ "GET" ]
          }),
          createRoute({
            id: "route-2",
            path: "/users",
            methods: [ "POST" ]
          })
        ])
      ).toEqual([]);
    });
  });

  describe("comparePaths()", () => {
    it("should identify exact paths", () => {
      expect(
        detector.comparePaths("/users", "/users")
      ).toEqual({
        conflict: true,
        type: "exact",
        severity: "high",
        message: "Both routes use the same path."
      });
    });

    it("should identify exact paths after normalization", () => {
      expect(
        detector.comparePaths("users/", "/users")
      ).toMatchObject({
        conflict: true,
        type: "exact"
      });
    });

    it("should identify parameter overlaps", () => {
      expect(
        detector.comparePaths("/users/:id", "/users/profile")
      ).toMatchObject({
        conflict: true,
        type: "parameter-overlap",
        severity: "medium"
      });
    });

    it("should return no conflict for unrelated paths", () => {
      expect(
        detector.comparePaths("/users", "/products")
      ).toEqual({
        conflict: false,
        type: "none",
        severity: "low",
        message: ""
      });
    });

    it("should identify root paths as exact", () => {
      expect(
        detector.comparePaths("/", "/")
      ).toMatchObject({
        conflict: true,
        type: "exact"
      });
    });
  });

  describe("pathsMayOverlap()", () => {
    it("should detect colon-style parameter overlaps", () => {
      expect(
        detector.pathsMayOverlap(
          "/users/:id",
          "/users/profile"
        )
      ).toBe(true);
    });

    it("should detect angle-bracket parameter overlaps", () => {
      expect(
        detector.pathsMayOverlap(
          "/users/<int:id>",
          "/users/profile"
        )
      ).toBe(true);
    });

    it("should detect brace-style parameter overlaps", () => {
      expect(
        detector.pathsMayOverlap(
          "/users/{id}",
          "/users/profile"
        )
      ).toBe(true);
    });

    it("should detect overlaps when the second path contains a parameter", () => {
      expect(
        detector.pathsMayOverlap(
          "/users/profile",
          "/users/:id"
        )
      ).toBe(true);
    });

    it("should reject different static segments", () => {
      expect(
        detector.pathsMayOverlap(
          "/users/profile",
          "/users/settings"
        )
      ).toBe(false);
    });

    it("should reject paths with different segment counts", () => {
      expect(
        detector.pathsMayOverlap(
          "/users/:id",
          "/users/:id/posts"
        )
      ).toBe(false);
    });

    it("should detect single-segment wildcard overlaps", () => {
      expect(
        detector.pathsMayOverlap(
          "/files/*",
          "/files/report"
        )
      ).toBe(true);
    });

    it("should detect prefixed wildcard overlaps", () => {
      expect(
        detector.pathsMayOverlap(
          "/files/*path",
          "/files/report"
        )
      ).toBe(true);
    });

    it("should detect double wildcard overlaps", () => {
      expect(
        detector.pathsMayOverlap(
          "/files/**",
          "/files/report"
        )
      ).toBe(true);
    });

    it("should detect brace wildcard overlaps", () => {
      expect(
        detector.pathsMayOverlap(
          "/files/{*}",
          "/files/report"
        )
      ).toBe(true);
    });

    it("should compare all path segments", () => {
      expect(
        detector.pathsMayOverlap(
          "/api/:version/users",
          "/api/v1/products"
        )
      ).toBe(false);
    });

    it("should detect overlaps in multiple parameter positions", () => {
      expect(
        detector.pathsMayOverlap(
          "/:version/users/:id",
          "/api/users/profile"
        )
      ).toBe(true);
    });
  });

  describe("getSharedMethods()", () => {
    it("should return methods shared by both routes", () => {
      expect(
        detector.getSharedMethods(
          [ "GET", "POST", "PUT" ],
          [ "POST", "DELETE", "GET" ]
        )
      ).toEqual([ "GET", "POST" ]);
    });

    it("should normalize methods before comparing", () => {
      expect(
        detector.getSharedMethods(
          [ " get ", "post" ],
          [ "GET", "POST" ]
        )
      ).toEqual([ "GET", "POST" ]);
    });

    it("should return an empty array when no methods overlap", () => {
      expect(
        detector.getSharedMethods(
          [ "GET" ],
          [ "POST" ]
        )
      ).toEqual([]);
    });

    it("should handle non-array method values", () => {
      expect(
        detector.getSharedMethods(
          "GET",
          [ "GET" ]
        )
      ).toEqual([]);
    });

    it("should remove duplicate shared methods", () => {
      expect(
        detector.getSharedMethods(
          [ "GET", "GET", "POST" ],
          [ "GET", "POST", "POST" ]
        )
      ).toEqual([ "GET", "POST" ]);
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

  describe("normalizePath()", () => {
    it("should add a leading slash", () => {
      expect(
        detector.normalizePath("users")
      ).toBe("/users");
    });

    it("should trim whitespace", () => {
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

    it("should preserve root", () => {
      expect(
        detector.normalizePath("/")
      ).toBe("/");
    });

    it("should return an empty string for non-string input", () => {
      expect(detector.normalizePath(null)).toBe("");
      expect(detector.normalizePath(123)).toBe("");
      expect(detector.normalizePath(undefined)).toBe("");
    });

    it("should normalize whitespace-only input to root", () => {
      expect(
        detector.normalizePath("   ")
      ).toBe("/");
    });
  });

  describe("getSegments()", () => {
    it("should split paths into segments", () => {
      expect(
        detector.getSegments("/api/users/:id")
      ).toEqual([ "api", "users", ":id" ]);
    });

    it("should ignore repeated slashes", () => {
      expect(
        detector.getSegments("/api//users///:id")
      ).toEqual([ "api", "users", ":id" ]);
    });

    it("should return an empty array for root", () => {
      expect(
        detector.getSegments("/")
      ).toEqual([]);
    });

    it("should normalize paths before splitting", () => {
      expect(
        detector.getSegments("api\\users\\profile")
      ).toEqual([ "api", "users", "profile" ]);
    });
  });

  describe("isParameter()", () => {
    it("should recognize colon-style parameters", () => {
      expect(detector.isParameter(":id")).toBe(true);
      expect(detector.isParameter(":userId")).toBe(true);
    });

    it("should recognize colon parameters with custom patterns", () => {
      expect(
        detector.isParameter(":id(\\d+)")
      ).toBe(true);
    });

    it("should recognize angle-bracket parameters", () => {
      expect(detector.isParameter("<id>")).toBe(true);
      expect(detector.isParameter("<int:id>")).toBe(true);
    });

    it("should recognize brace-style parameters", () => {
      expect(detector.isParameter("{id}")).toBe(true);
      expect(detector.isParameter("{user_id}")).toBe(true);
    });

    it("should reject static segments", () => {
      expect(detector.isParameter("users")).toBe(false);
      expect(detector.isParameter("profile")).toBe(false);
      expect(detector.isParameter("123")).toBe(false);
    });

    it("should reject malformed colon parameters", () => {
      expect(detector.isParameter(":")).toBe(false);
      expect(detector.isParameter(":123")).toBe(false);
      expect(detector.isParameter(":user-id")).toBe(false);
    });
  });

  describe("isWildcard()", () => {
    it("should recognize a single wildcard", () => {
      expect(detector.isWildcard("*")).toBe(true);
    });

    it("should recognize prefixed wildcards", () => {
      expect(detector.isWildcard("*path")).toBe(true);
      expect(detector.isWildcard("*rest")).toBe(true);
    });

    it("should recognize a double wildcard", () => {
      expect(detector.isWildcard("**")).toBe(true);
    });

    it("should recognize brace wildcard", () => {
      expect(detector.isWildcard("{*}")).toBe(true);
    });

    it("should reject normal path segments", () => {
      expect(detector.isWildcard("users")).toBe(false);
      expect(detector.isWildcard(":id")).toBe(false);
      expect(detector.isWildcard("{id}")).toBe(false);
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

    it("should reject routes with non-string paths", () => {
      expect(
        detector.isValidRoute(createRoute({
          path: 123
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

    it("should accept an empty path string because only its type is checked", () => {
      expect(
        detector.isValidRoute(createRoute({
          path: ""
        }))
      ).toBe(true);
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
        "ConflictDetector has been destroyed."
      );
    });
  });
});
