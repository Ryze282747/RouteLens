import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import FrontendMatcher from "../../src/analyzers/FrontendMatcher.js";

describe("FrontendMatcher", () => {
  let matcher;

  const createCall = (overrides = {}) => ({
    method: "GET",
    path: "/users",
    ...overrides
  });

  const createRoute = (overrides = {}) => ({
    id: "route-1",
    methods: [ "GET" ],
    path: "/users",
    ...overrides
  });

  beforeEach(() => {
    matcher = new FrontendMatcher();
  });

  afterEach(() => {
    if (!matcher.destroyed) {
      matcher.destroy();
    }
  });

  describe("constructor", () => {
    it("should initialize without being destroyed", () => {
      expect(matcher.destroyed).toBe(false);
    });

    it("should initialize supported HTTP methods", () => {
      expect(matcher.httpMethods).toBeInstanceOf(Set);

      expect([ ...matcher.httpMethods ]).toEqual([
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
        "HEAD"
      ]);
    });
  });

  describe("analyze()", () => {
    it("should reject non-array frontend calls", () => {
      expect(() => matcher.analyze(null, [])).toThrow(
        "Frontend API calls must be provided as an array."
      );

      expect(() => matcher.analyze({}, [])).toThrow(
        "Frontend API calls must be provided as an array."
      );
    });

    it("should reject non-array backend routes", () => {
      expect(() => matcher.analyze([], null)).toThrow(
        "Backend routes must be provided as an array."
      );

      expect(() => matcher.analyze([], {})).toThrow(
        "Backend routes must be provided as an array."
      );
    });

    it("should return zero counts for empty inputs", () => {
      expect(
        matcher.analyze([], [])
      ).toEqual({
        total: 0,
        matched: 0,
        unmatched: 0,
        ambiguous: 0,
        matches: [],
        unmatchedCalls: [],
        ambiguousCalls: []
      });
    });

    it("should match a frontend call to an exact backend route", () => {
      const call = createCall();
      const route = createRoute();

      const result = matcher.analyze([ call ], [ route ]);

      expect(result.total).toBe(1);
      expect(result.matched).toBe(1);
      expect(result.unmatched).toBe(0);
      expect(result.ambiguous).toBe(0);

      expect(result.matches[ 0 ]).toMatchObject({
        method: "GET",
        path: "/users",
        status: "matched",
        route
      });
    });

    it("should report unmatched frontend calls", () => {
      const result = matcher.analyze(
        [
          createCall({
            path: "/products"
          })
        ],
        [
          createRoute({
            path: "/users"
          })
        ]
      );

      expect(result.matched).toBe(0);
      expect(result.unmatched).toBe(1);
      expect(result.ambiguous).toBe(0);

      expect(result.unmatchedCalls[ 0 ]).toMatchObject({
        method: "GET",
        path: "/products",
        status: "unmatched",
        message: "No matching backend route was found."
      });
    });

    it("should report ambiguous calls when multiple routes match", () => {
      const first = createRoute({
        id: "route-1"
      });

      const second = createRoute({
        id: "route-2"
      });

      const result = matcher.analyze(
        [ createCall() ],
        [ first, second ]
      );

      expect(result.matched).toBe(0);
      expect(result.unmatched).toBe(0);
      expect(result.ambiguous).toBe(1);

      expect(result.ambiguousCalls[ 0 ]).toMatchObject({
        method: "GET",
        path: "/users",
        status: "ambiguous",
        candidates: [ first, second ],
        message: "Multiple backend routes may match this API call."
      });
    });

    it("should classify multiple calls independently", () => {
      const calls = [
        createCall({
          path: "/users"
        }),
        createCall({
          path: "/products"
        }),
        createCall({
          path: "/orders"
        })
      ];

      const routes = [
        createRoute({
          id: "users",
          path: "/users"
        }),
        createRoute({
          id: "orders",
          path: "/orders"
        })
      ];

      const result = matcher.analyze(calls, routes);

      expect(result.total).toBe(3);
      expect(result.matched).toBe(2);
      expect(result.unmatched).toBe(1);
      expect(result.ambiguous).toBe(0);
    });

    it("should ignore invalid frontend calls", () => {
      const result = matcher.analyze(
        [
          null,
          undefined,
          "invalid",
          123,
          [],
          {},
          createCall()
        ],
        [ createRoute() ]
      );

      expect(result.total).toBe(7);
      expect(result.matched).toBe(1);
    });

    it("should ignore calls with missing paths", () => {
      const result = matcher.analyze(
        [
          {
            method: "GET"
          },
          createCall()
        ],
        [ createRoute() ]
      );

      expect(result.total).toBe(2);
      expect(result.matched).toBe(1);
    });

    it("should ignore calls with empty paths", () => {
      const result = matcher.analyze(
        [
          createCall({
            path: ""
          }),
          createCall()
        ],
        [ createRoute() ]
      );

      expect(result.matched).toBe(1);
    });

    it("should ignore calls with whitespace-only paths", () => {
      const result = matcher.analyze(
        [
          createCall({
            path: "   "
          }),
          createCall()
        ],
        [ createRoute() ]
      );

      expect(result.matched).toBe(1);
    });

    it("should ignore calls with non-string methods", () => {
      const result = matcher.analyze(
        [
          createCall({
            method: 123
          }),
          createCall()
        ],
        [ createRoute() ]
      );

      expect(result.matched).toBe(1);
    });

    it("should accept calls with missing methods and default to GET", () => {
      const result = matcher.analyze(
        [
          {
            path: "/users"
          }
        ],
        [ createRoute() ]
      );

      expect(result.matched).toBe(1);
      expect(result.matches[ 0 ].method).toBe("GET");
    });

    it("should accept calls with null methods and default to GET", () => {
      const result = matcher.analyze(
        [
          createCall({
            method: null
          })
        ],
        [ createRoute() ]
      );

      expect(result.matched).toBe(1);
      expect(result.matches[ 0 ].method).toBe("GET");
    });

    it("should ignore invalid backend routes", () => {
      const result = matcher.analyze(
        [ createCall() ],
        [
          null,
          undefined,
          "invalid",
          123,
          {},
          {
            path: "/users",
            methods: "GET"
          },
          {
            path: "/users",
            methods: []
          },
          createRoute()
        ]
      );

      expect(result.matched).toBe(1);
      expect(result.ambiguous).toBe(0);
    });

    it("should preserve the original backend route reference", () => {
      const route = createRoute();

      const result = matcher.analyze(
        [ createCall() ],
        [ route ]
      );

      expect(result.matches[ 0 ].route).toBe(route);
    });

    it("should preserve additional frontend call properties", () => {
      const call = createCall({
        id: "call-1",
        source: "UserPage.jsx",
        line: 15,
        data: {
          userId: 1
        }
      });

      const result = matcher.analyze(
        [ call ],
        [ createRoute() ]
      );

      expect(result.matches[ 0 ]).toMatchObject({
        id: "call-1",
        source: "UserPage.jsx",
        line: 15,
        data: {
          userId: 1
        }
      });
    });

    it("should include the original frontend call count in total", () => {
      const result = matcher.analyze(
        [
          createCall(),
          null,
          {}
        ],
        [ createRoute() ]
      );

      expect(result.total).toBe(3);
      expect(result.matched).toBe(1);
    });

    it("should not classify one call in multiple result categories", () => {
      const result = matcher.analyze(
        [
          createCall({
            path: "/users"
          }),
          createCall({
            path: "/products"
          }),
          createCall({
            path: "/orders"
          })
        ],
        [
          createRoute({
            id: "users-1",
            path: "/users"
          }),
          createRoute({
            id: "users-2",
            path: "/users"
          })
        ]
      );

      expect(
        result.matched +
        result.unmatched +
        result.ambiguous
      ).toBe(3);
    });
  });

  describe("normalizeCall()", () => {
    it("should uppercase the HTTP method", () => {
      expect(
        matcher.normalizeCall(
          createCall({
            method: "get"
          })
        ).method
      ).toBe("GET");
    });

    it("should trim the HTTP method", () => {
      expect(
        matcher.normalizeCall(
          createCall({
            method: "  post  "
          })
        ).method
      ).toBe("POST");
    });

    it("should default an empty method to GET", () => {
      expect(
        matcher.normalizeCall(
          createCall({
            method: ""
          })
        ).method
      ).toBe("GET");
    });

    it("should normalize the path", () => {
      expect(
        matcher.normalizeCall(
          createCall({
            path: "users//profile/"
          })
        ).path
      ).toBe("/users/profile");
    });

    it("should preserve additional call properties", () => {
      const call = createCall({
        id: "call-1",
        source: "App.jsx"
      });

      expect(
        matcher.normalizeCall(call)
      ).toMatchObject({
        id: "call-1",
        source: "App.jsx",
        method: "GET",
        path: "/users"
      });
    });
  });

  describe("methodsMatch()", () => {
    it("should match identical methods", () => {
      expect(
        matcher.methodsMatch("GET", [ "GET" ])
      ).toBe(true);
    });

    it("should match methods regardless of casing", () => {
      expect(
        matcher.methodsMatch("get", [ "GET" ])
      ).toBe(true);
    });

    it("should trim method whitespace", () => {
      expect(
        matcher.methodsMatch(" GET ", [ " GET " ])
      ).toBe(true);
    });

    it("should find a matching method in a list", () => {
      expect(
        matcher.methodsMatch(
          "POST",
          [ "GET", "POST", "DELETE" ]
        )
      ).toBe(true);
    });

    it("should reject different methods", () => {
      expect(
        matcher.methodsMatch("GET", [ "POST" ])
      ).toBe(false);
    });

    it("should reject non-array backend methods", () => {
      expect(
        matcher.methodsMatch("GET", "GET")
      ).toBe(false);

      expect(
        matcher.methodsMatch("GET", null)
      ).toBe(false);
    });

    it("should reject empty method arrays", () => {
      expect(
        matcher.methodsMatch("GET", [])
      ).toBe(false);
    });

    it("should compare methods not listed in httpMethods", () => {
      expect(
        matcher.methodsMatch("TRACE", [ "TRACE" ])
      ).toBe(true);
    });
  });

  describe("pathsMatch()", () => {
    it("should match identical paths", () => {
      expect(
        matcher.pathsMatch("/users", "/users")
      ).toBe(true);
    });

    it("should match paths after normalization", () => {
      expect(
        matcher.pathsMatch(
          "users/",
          "/users"
        )
      ).toBe(true);
    });

    it("should match paths with different parameter names", () => {
      expect(
        matcher.pathsMatch(
          "/users/123",
          "/users/:id"
        )
      ).toBe(true);
    });

    it("should match angle-bracket parameters", () => {
      expect(
        matcher.pathsMatch(
          "/users/123",
          "/users/<int:id>"
        )
      ).toBe(true);
    });

    it("should match brace-style parameters", () => {
      expect(
        matcher.pathsMatch(
          "/users/123",
          "/users/{id}"
        )
      ).toBe(true);
    });

    it("should match colon parameters with custom patterns", () => {
      expect(
        matcher.pathsMatch(
          "/users/123",
          String.raw`/users/:id(\d+)`
        )
      ).toBe(true);
    });

    it("should match wildcard backend segments", () => {
      expect(
        matcher.pathsMatch(
          "/files/report",
          "/files/*"
        )
      ).toBe(true);
    });

    it("should match prefixed wildcard backend segments", () => {
      expect(
        matcher.pathsMatch(
          "/files/report",
          "/files/*path"
        )
      ).toBe(true);
    });

    it("should reject different static segments", () => {
      expect(
        matcher.pathsMatch(
          "/users/profile",
          "/users/settings"
        )
      ).toBe(false);
    });

    it("should reject paths with different segment counts", () => {
      expect(
        matcher.pathsMatch(
          "/users/123",
          "/users/:id/posts"
        )
      ).toBe(false);
    });

    it("should not treat frontend parameters as backend parameters", () => {
      expect(
        matcher.pathsMatch(
          "/users/:id",
          "/users/profile"
        )
      ).toBe(false);
    });

    it("should match root paths", () => {
      expect(
        matcher.pathsMatch("/", "/")
      ).toBe(true);
    });

    it("should reject root and non-root paths", () => {
      expect(
        matcher.pathsMatch("/", "/users")
      ).toBe(false);
    });

    it("should normalize backslashes before matching", () => {
      expect(
        matcher.pathsMatch(
          "\\users\\123",
          "/users/:id"
        )
      ).toBe(true);
    });
  });

  describe("isBackendParameter()", () => {
    it("should recognize colon-style parameters", () => {
      expect(matcher.isBackendParameter(":id")).toBe(true);
      expect(matcher.isBackendParameter(":userId")).toBe(true);
    });

    it("should recognize colon parameters with patterns", () => {
      expect(
        matcher.isBackendParameter(":id(\\d+)")
      ).toBe(true);
    });

    it("should recognize angle-bracket parameters", () => {
      expect(
        matcher.isBackendParameter("<int:id>")
      ).toBe(true);
    });

    it("should recognize brace-style parameters", () => {
      expect(
        matcher.isBackendParameter("{id}")
      ).toBe(true);
    });

    it("should recognize wildcard segments", () => {
      expect(matcher.isBackendParameter("*")).toBe(true);
      expect(matcher.isBackendParameter("*path")).toBe(true);
      expect(matcher.isBackendParameter("**")).toBe(true);
    });

    it("should reject static segments", () => {
      expect(matcher.isBackendParameter("users")).toBe(false);
      expect(matcher.isBackendParameter("profile")).toBe(false);
    });
  });

  describe("getSegments()", () => {
    it("should split a normalized path into segments", () => {
      expect(
        matcher.getSegments("/api/users/:id")
      ).toEqual([ "api", "users", ":id" ]);
    });

    it("should ignore empty segments", () => {
      expect(
        matcher.getSegments("/api//users///:id")
      ).toEqual([ "api", "users", ":id" ]);
    });

    it("should return an empty array for root", () => {
      expect(
        matcher.getSegments("/")
      ).toEqual([]);
    });
  });

  describe("normalizePath()", () => {
    it("should add a leading slash", () => {
      expect(
        matcher.normalizePath("users")
      ).toBe("/users");
    });

    it("should trim whitespace", () => {
      expect(
        matcher.normalizePath("  /users  ")
      ).toBe("/users");
    });

    it("should replace backslashes", () => {
      expect(
        matcher.normalizePath("\\users\\profile")
      ).toBe("/users/profile");
    });

    it("should collapse repeated slashes", () => {
      expect(
        matcher.normalizePath("/users///profile")
      ).toBe("/users/profile");
    });

    it("should remove trailing slashes", () => {
      expect(
        matcher.normalizePath("/users/profile///")
      ).toBe("/users/profile");
    });

    it("should preserve the root path", () => {
      expect(
        matcher.normalizePath("/")
      ).toBe("/");
    });

    it("should return an empty string for non-string input", () => {
      expect(matcher.normalizePath(null)).toBe("");
      expect(matcher.normalizePath(123)).toBe("");
      expect(matcher.normalizePath(undefined)).toBe("");
    });

    it("should remove query strings", () => {
      expect(
        matcher.normalizePath("/users?page=2")
      ).toBe("/users");
    });

    it("should remove URL fragments", () => {
      expect(
        matcher.normalizePath("/users#profile")
      ).toBe("/users");
    });

    it("should remove both query strings and fragments", () => {
      expect(
        matcher.normalizePath("/users?page=2#profile")
      ).toBe("/users");
    });

    it("should normalize query strings before matching", () => {
      expect(
        matcher.pathsMatch(
          "/users?page=2",
          "/users"
        )
      ).toBe(true);
    });

    it("should normalize fragments before matching", () => {
      expect(
        matcher.pathsMatch(
          "/users#profile",
          "/users"
        )
      ).toBe(true);
    });

    it("should normalize whitespace-only input to root", () => {
      expect(
        matcher.normalizePath("   ")
      ).toBe("/");
    });
  });

  describe("isValidCall()", () => {
    it("should accept a valid frontend call", () => {
      expect(
        matcher.isValidCall(createCall())
      ).toBe(true);
    });

    it("should accept a call without a method", () => {
      expect(
        matcher.isValidCall({
          path: "/users"
        })
      ).toBe(true);
    });

    it("should accept a call with a null method", () => {
      expect(
        matcher.isValidCall({
          path: "/users",
          method: null
        })
      ).toBe(true);
    });

    it("should reject null", () => {
      expect(matcher.isValidCall(null)).toBeFalsy();
    });

    it("should reject primitive values", () => {
      expect(matcher.isValidCall("call")).toBe(false);
      expect(matcher.isValidCall(123)).toBe(false);
    });

    it("should reject arrays", () => {
      expect(matcher.isValidCall([])).toBe(false);
    });

    it("should reject calls without a path", () => {
      expect(
        matcher.isValidCall({
          method: "GET"
        })
      ).toBe(false);
    });

    it("should reject non-string paths", () => {
      expect(
        matcher.isValidCall({
          method: "GET",
          path: 123
        })
      ).toBe(false);
    });

    it("should reject empty paths", () => {
      expect(
        matcher.isValidCall({
          method: "GET",
          path: ""
        })
      ).toBe(false);
    });

    it("should reject whitespace-only paths", () => {
      expect(
        matcher.isValidCall({
          method: "GET",
          path: "   "
        })
      ).toBe(false);
    });

    it("should reject non-string methods", () => {
      expect(
        matcher.isValidCall({
          method: 123,
          path: "/users"
        })
      ).toBe(false);
    });

    it("should reject array methods", () => {
      expect(
        matcher.isValidCall({
          method: [ "GET" ],
          path: "/users"
        })
      ).toBe(false);
    });
  });

  describe("isValidRoute()", () => {
    it("should accept a valid backend route", () => {
      expect(
        matcher.isValidRoute(createRoute())
      ).toBe(true);
    });

    it("should reject null", () => {
      expect(matcher.isValidRoute(null)).toBeFalsy();
    });

    it("should reject primitive values", () => {
      expect(matcher.isValidRoute("route")).toBe(false);
      expect(matcher.isValidRoute(123)).toBe(false);
    });

    it("should reject arrays", () => {
      expect(matcher.isValidRoute([])).toBe(false);
    });

    it("should reject routes without a path", () => {
      expect(
        matcher.isValidRoute({
          methods: [ "GET" ]
        })
      ).toBe(false);
    });

    it("should reject non-string paths", () => {
      expect(
        matcher.isValidRoute({
          path: 123,
          methods: [ "GET" ]
        })
      ).toBe(false);
    });

    it("should reject routes without a methods array", () => {
      expect(
        matcher.isValidRoute({
          path: "/users",
          methods: "GET"
        })
      ).toBe(false);
    });

    it("should reject routes with empty methods arrays", () => {
      expect(
        matcher.isValidRoute({
          path: "/users",
          methods: []
        })
      ).toBe(false);
    });

    it("should accept an empty path string because only its type is checked", () => {
      expect(
        matcher.isValidRoute({
          path: "",
          methods: [ "GET" ]
        })
      ).toBe(true);
    });
  });

  describe("lifecycle", () => {
    it("should mark the matcher as destroyed", () => {
      matcher.destroy();

      expect(matcher.destroyed).toBe(true);
    });

    it("should clear supported HTTP methods on destruction", () => {
      matcher.destroy();

      expect(matcher.httpMethods.size).toBe(0);
    });

    it("should allow destroy() to be called more than once", () => {
      matcher.destroy();

      expect(() => matcher.destroy()).not.toThrow();
    });

    it("should throw when analyze() is called after destruction", () => {
      matcher.destroy();

      expect(() => matcher.analyze([], [])).toThrow(
        "FrontendMatcher has been destroyed."
      );
    });
  });
});
