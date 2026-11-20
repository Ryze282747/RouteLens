
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import RouteNormalizer from "../../src/analyzers/RouteNormalizer.js";

describe("RouteNormalizer", () => {
  let normalizer;

  const validRoute = {
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    framework: "express",
    file: "/project/routes/users.js",
    line: 10,
    handler: "getUsers",
    controller: "UserController",
    blueprint: null,
    router: "userRouter",
    prefix: "/api",
    metadata: {
      middleware: [ "auth" ]
    },
    source: {
      start: 10,
      end: 15
    }
  };

  beforeEach(() => {
    normalizer = new RouteNormalizer();
  });

  afterEach(() => {
    if (!normalizer.destroyed) {
      normalizer.destroy();
    }
  });

  describe("constructor", () => {
    it("should initialize with supported HTTP methods", () => {
      expect(normalizer.validMethods).toBeInstanceOf(Set);

      expect([ ...normalizer.validMethods ]).toEqual([
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
    });

    it("should not be destroyed initially", () => {
      expect(normalizer.destroyed).toBe(false);
    });
  });

  describe("validate()", () => {
    it("should accept a valid route", () => {
      expect(() => normalizer.validate(validRoute)).not.toThrow();
    });

    it("should reject null", () => {
      expect(() => normalizer.validate(null)).toThrow(
        "A route must be an object."
      );
    });

    it("should reject undefined", () => {
      expect(() => normalizer.validate(undefined)).toThrow(
        "A route must be an object."
      );
    });

    it("should reject arrays", () => {
      expect(() => normalizer.validate([])).toThrow(
        "A route must be an object."
      );
    });

    it("should reject primitive values", () => {
      expect(() => normalizer.validate("route")).toThrow(
        "A route must be an object."
      );

      expect(() => normalizer.validate(123)).toThrow(
        "A route must be an object."
      );
    });

    it("should reject a missing path", () => {
      const route = {
        ...validRoute,
        path: undefined
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must have a valid path."
      );
    });

    it("should reject an empty path", () => {
      const route = {
        ...validRoute,
        path: ""
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must have a valid path."
      );
    });

    it("should reject a whitespace-only path", () => {
      const route = {
        ...validRoute,
        path: "   "
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must have a valid path."
      );
    });

    it("should reject a non-string path", () => {
      const route = {
        ...validRoute,
        path: 123
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must have a valid path."
      );
    });

    it("should reject missing methods", () => {
      const route = {
        ...validRoute,
        methods: undefined
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must contain at least one HTTP method."
      );
    });

    it("should reject an empty methods array", () => {
      const route = {
        ...validRoute,
        methods: []
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must contain at least one HTTP method."
      );
    });

    it("should reject methods that are not an array", () => {
      const route = {
        ...validRoute,
        methods: "GET"
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must contain at least one HTTP method."
      );
    });

    it("should reject a missing source file", () => {
      const route = {
        ...validRoute,
        file: undefined
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must have a source file."
      );
    });

    it("should reject an empty source file", () => {
      const route = {
        ...validRoute,
        file: ""
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must have a source file."
      );
    });

    it("should reject a whitespace-only source file", () => {
      const route = {
        ...validRoute,
        file: "   "
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must have a source file."
      );
    });

    it("should reject a non-string source file", () => {
      const route = {
        ...validRoute,
        file: 123
      };

      expect(() => normalizer.validate(route)).toThrow(
        "A route must have a source file."
      );
    });
  });

  describe("normalizeMethods()", () => {
    it("should uppercase HTTP methods", () => {
      expect(
        normalizer.normalizeMethods([ "get", "post", "put" ])
      ).toEqual([ "GET", "POST", "PUT" ]);
    });

    it("should trim whitespace from methods", () => {
      expect(
        normalizer.normalizeMethods([ " GET ", " POST " ])
      ).toEqual([ "GET", "POST" ]);
    });

    it("should remove unsupported methods", () => {
      expect(
        normalizer.normalizeMethods([
          "GET",
          "INVALID",
          "CUSTOM",
          "POST"
        ])
      ).toEqual([ "GET", "POST" ]);
    });

    it("should remove duplicate methods", () => {
      expect(
        normalizer.normalizeMethods([
          "GET",
          "get",
          "POST",
          "post"
        ])
      ).toEqual([ "GET", "POST" ]);
    });

    it("should sort methods alphabetically", () => {
      expect(
        normalizer.normalizeMethods([
          "POST",
          "DELETE",
          "GET",
          "PATCH"
        ])
      ).toEqual([
        "DELETE",
        "GET",
        "PATCH",
        "POST"
      ]);
    });

    it("should support all recognized HTTP methods", () => {
      expect(
        normalizer.normalizeMethods([
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "OPTIONS",
          "HEAD",
          "TRACE",
          "CONNECT"
        ])
      ).toEqual([
        "CONNECT",
        "DELETE",
        "GET",
        "HEAD",
        "OPTIONS",
        "PATCH",
        "POST",
        "PUT",
        "TRACE"
      ]);
    });

    it("should convert non-string method values to strings", () => {
      expect(
        normalizer.normalizeMethods([
          "GET",
          123,
          null,
          undefined
        ])
      ).toEqual([ "GET" ]);
    });

    it("should return an empty array when all methods are unsupported", () => {
      expect(
        normalizer.normalizeMethods([
          "CUSTOM",
          "INVALID"
        ])
      ).toEqual([]);
    });
  });

  describe("normalizePath()", () => {
    it("should preserve a valid absolute path", () => {
      expect(
        normalizer.normalizePath("/users")
      ).toBe("/users");
    });

    it("should add a leading slash", () => {
      expect(
        normalizer.normalizePath("users")
      ).toBe("/users");
    });

    it("should trim surrounding whitespace", () => {
      expect(
        normalizer.normalizePath("  /users  ")
      ).toBe("/users");
    });

    it("should replace backslashes with forward slashes", () => {
      expect(
        normalizer.normalizePath("\\users\\profile")
      ).toBe("/users/profile");
    });

    it("should collapse repeated slashes", () => {
      expect(
        normalizer.normalizePath("users///profile//settings")
      ).toBe("/users/profile/settings");
    });

    it("should remove trailing slashes", () => {
      expect(
        normalizer.normalizePath("/users/profile///")
      ).toBe("/users/profile");
    });

    it("should preserve the root path", () => {
      expect(
        normalizer.normalizePath("/")
      ).toBe("/");
    });

    it("should normalize repeated root slashes", () => {
      expect(
        normalizer.normalizePath("////")
      ).toBe("/");
    });

    it("should preserve route parameters", () => {
      expect(
        normalizer.normalizePath("/users/{id}/posts/:postId")
      ).toBe("/users/{id}/posts/:postId");
    });

    it("should preserve wildcard route segments", () => {
      expect(
        normalizer.normalizePath("/files/*")
      ).toBe("/files/*");
    });

    it("should normalize a path containing only whitespace to root", () => {
      expect(
        normalizer.normalizePath("   ")
      ).toBe("/");
    });
  });

  describe("normalizeId()", () => {
    it("should preserve a valid ID", () => {
      expect(
        normalizer.normalizeId("route-123")
      ).toBe("route-123");
    });

    it("should trim an ID", () => {
      expect(
        normalizer.normalizeId("  route-123  ")
      ).toBe("route-123");
    });

    it("should return null for an empty ID", () => {
      expect(
        normalizer.normalizeId("")
      ).toBeNull();
    });

    it("should return null for whitespace-only IDs", () => {
      expect(
        normalizer.normalizeId("   ")
      ).toBeNull();
    });

    it("should return null for non-string IDs", () => {
      expect(normalizer.normalizeId(123)).toBeNull();
      expect(normalizer.normalizeId(null)).toBeNull();
      expect(normalizer.normalizeId(undefined)).toBeNull();
    });
  });

  describe("normalizeLine()", () => {
    it("should preserve a positive integer line number", () => {
      expect(normalizer.normalizeLine(10)).toBe(10);
    });

    it("should reject zero", () => {
      expect(normalizer.normalizeLine(0)).toBeNull();
    });

    it("should reject negative values", () => {
      expect(normalizer.normalizeLine(-1)).toBeNull();
    });

    it("should reject decimal values", () => {
      expect(normalizer.normalizeLine(1.5)).toBeNull();
    });

    it("should reject numeric strings", () => {
      expect(normalizer.normalizeLine("10")).toBeNull();
    });

    it("should reject non-numeric values", () => {
      expect(normalizer.normalizeLine(null)).toBeNull();
      expect(normalizer.normalizeLine(undefined)).toBeNull();
      expect(normalizer.normalizeLine("line")).toBeNull();
    });
  });

  describe("normalizeText()", () => {
    it("should trim valid text", () => {
      expect(
        normalizer.normalizeText("  express  ")
      ).toBe("express");
    });

    it("should return the default fallback for empty strings", () => {
      expect(
        normalizer.normalizeText("")
      ).toBe("");
    });

    it("should use a custom fallback", () => {
      expect(
        normalizer.normalizeText("", "unknown")
      ).toBe("unknown");
    });

    it("should use the fallback for non-string values", () => {
      expect(
        normalizer.normalizeText(null, "unknown")
      ).toBe("unknown");

      expect(
        normalizer.normalizeText(123, "unknown")
      ).toBe("unknown");
    });
  });

  describe("normalizeNullableText()", () => {
    it("should trim valid text", () => {
      expect(
        normalizer.normalizeNullableText("  UserController  ")
      ).toBe("UserController");
    });

    it("should return null for empty strings", () => {
      expect(
        normalizer.normalizeNullableText("")
      ).toBeNull();
    });

    it("should return null for whitespace-only strings", () => {
      expect(
        normalizer.normalizeNullableText("   ")
      ).toBeNull();
    });

    it("should return null for non-string values", () => {
      expect(normalizer.normalizeNullableText(null)).toBeNull();
      expect(normalizer.normalizeNullableText(123)).toBeNull();
      expect(normalizer.normalizeNullableText(undefined)).toBeNull();
    });
  });

  describe("normalizeMetadata()", () => {
    it("should preserve metadata properties", () => {
      const metadata = {
        middleware: [ "auth" ],
        name: "users.index"
      };

      expect(
        normalizer.normalizeMetadata(metadata)
      ).toEqual(metadata);
    });

    it("should return a shallow copy", () => {
      const metadata = {
        middleware: [ "auth" ]
      };

      const result = normalizer.normalizeMetadata(metadata);

      expect(result).not.toBe(metadata);
      expect(result.middleware).toBe(metadata.middleware);
    });

    it("should return an empty object for null", () => {
      expect(
        normalizer.normalizeMetadata(null)
      ).toEqual({});
    });

    it("should return an empty object for arrays", () => {
      expect(
        normalizer.normalizeMetadata([ "auth" ])
      ).toEqual({});
    });

    it("should return an empty object for primitive values", () => {
      expect(normalizer.normalizeMetadata("metadata")).toEqual({});
      expect(normalizer.normalizeMetadata(123)).toEqual({});
      expect(normalizer.normalizeMetadata(false)).toEqual({});
    });
  });

  describe("normalizeSource()", () => {
    it("should preserve source properties", () => {
      const source = {
        start: 10,
        end: 20,
        column: 5
      };

      expect(
        normalizer.normalizeSource(source)
      ).toEqual(source);
    });

    it("should return a shallow copy", () => {
      const source = {
        start: 10
      };

      const result = normalizer.normalizeSource(source);

      expect(result).not.toBe(source);
    });

    it("should return null for null", () => {
      expect(normalizer.normalizeSource(null)).toBeNull();
    });

    it("should return null for arrays", () => {
      expect(normalizer.normalizeSource([])).toBeNull();
    });

    it("should return null for primitive values", () => {
      expect(normalizer.normalizeSource("source")).toBeNull();
      expect(normalizer.normalizeSource(123)).toBeNull();
      expect(normalizer.normalizeSource(false)).toBeNull();
    });
  });

  describe("normalize()", () => {
    it("should normalize a complete route", () => {
      const result = normalizer.normalize(validRoute);

      expect(result).toEqual({
        id: "route-1",
        path: "/users",
        methods: [ "GET" ],
        framework: "express",
        file: "/project/routes/users.js",
        line: 10,
        handler: "getUsers",
        controller: "UserController",
        blueprint: null,
        router: "userRouter",
        prefix: "/api",
        metadata: {
          middleware: [ "auth" ]
        },
        source: {
          start: 10,
          end: 15
        }
      });
    });

    it("should normalize optional fields when omitted", () => {
      const result = normalizer.normalize({
        path: "users",
        methods: [ "get" ],
        file: "/project/routes.js"
      });

      expect(result).toEqual({
        id: null,
        path: "/users",
        methods: [ "GET" ],
        framework: "unknown",
        file: "/project/routes.js",
        line: null,
        handler: null,
        controller: null,
        blueprint: null,
        router: null,
        prefix: "",
        metadata: {},
        source: null
      });
    });

    it("should normalize all route methods", () => {
      const result = normalizer.normalize({
        ...validRoute,
        methods: [ "get", "post", "GET", "invalid" ]
      });

      expect(result.methods).toEqual([ "GET", "POST" ]);
    });

    it("should normalize paths and text fields", () => {
      const result = normalizer.normalize({
        ...validRoute,
        path: "  users//profile/  ",
        framework: "  flask  ",
        file: "  /project/routes.py  ",
        handler: "  get_users  ",
        controller: "  UserController  ",
        blueprint: "  api  ",
        router: "  userRouter  ",
        prefix: "  /api  "
      });

      expect(result).toMatchObject({
        path: "/users/profile",
        framework: "flask",
        file: "/project/routes.py",
        handler: "get_users",
        controller: "UserController",
        blueprint: "api",
        router: "userRouter",
        prefix: "/api"
      });
    });

    it("should reject routes with no supported methods after normalization only by returning an empty method list", () => {
      const result = normalizer.normalize({
        ...validRoute,
        methods: [ "CUSTOM", "INVALID" ]
      });

      expect(result.methods).toEqual([]);
    });

    it("should reject invalid route objects", () => {
      expect(() => normalizer.normalize(null)).toThrow(
        "A route must be an object."
      );
    });

    it("should reject routes with invalid paths", () => {
      expect(() => normalizer.normalize({
        ...validRoute,
        path: ""
      })).toThrow("A route must have a valid path.");
    });

    it("should reject routes without methods", () => {
      expect(() => normalizer.normalize({
        ...validRoute,
        methods: []
      })).toThrow(
        "A route must contain at least one HTTP method."
      );
    });

    it("should reject routes without source files", () => {
      expect(() => normalizer.normalize({
        ...validRoute,
        file: ""
      })).toThrow("A route must have a source file.");
    });
  });

  describe("normalizeMany()", () => {
    it("should normalize multiple routes", () => {
      const routes = [
        validRoute,
        {
          path: "/products",
          methods: [ "post" ],
          file: "/project/routes/products.js"
        }
      ];

      const result = normalizer.normalizeMany(routes);

      expect(result).toHaveLength(2);
      expect(result[ 0 ].path).toBe("/users");
      expect(result[ 1 ].path).toBe("/products");
      expect(result[ 1 ].methods).toEqual([ "POST" ]);
    });

    it("should return an empty array for an empty input", () => {
      expect(normalizer.normalizeMany([])).toEqual([]);
    });

    it("should reject non-array input", () => {
      expect(() => normalizer.normalizeMany(null)).toThrow(
        "Routes must be provided as an array."
      );

      expect(() => normalizer.normalizeMany({})).toThrow(
        "Routes must be provided as an array."
      );
    });

    it("should reject an invalid route inside the array", () => {
      expect(() => normalizer.normalizeMany([
        validRoute,
        {
          path: "",
          methods: [ "GET" ],
          file: "/project/routes.js"
        }
      ])).toThrow("A route must have a valid path.");
    });
  });

  describe("lifecycle", () => {
    it("should throw when normalize() is called after destruction", () => {
      normalizer.destroy();

      expect(() => normalizer.normalize(validRoute)).toThrow(
        "RouteNormalizer has been destroyed."
      );
    });

    it("should throw when normalizeMany() is called after destruction", () => {
      normalizer.destroy();

      expect(() => normalizer.normalizeMany([])).toThrow(
        "RouteNormalizer has been destroyed."
      );
    });

    it("should clear supported methods on destruction", () => {
      normalizer.destroy();

      expect(normalizer.validMethods.size).toBe(0);
    });

    it("should mark the normalizer as destroyed", () => {
      normalizer.destroy();

      expect(normalizer.destroyed).toBe(true);
    });

    it("should allow destroy() to be called more than once", () => {
      normalizer.destroy();

      expect(() => normalizer.destroy()).not.toThrow();
    });
  });
});
