
import { beforeEach, describe, expect, it, vi } from "vitest";
import RouteRegistry from "../../src/core/RouteRegistry.js";

describe("RouteRegistry", () => {
  let registry;

  const createRoute = (overrides = {}) => ({
    path: "/api/users",
    methods: [ "GET" ],
    file: "src/routes/users.py",
    framework: "flask",
    line: 10,
    handler: "get_users",
    ...overrides
  });

  beforeEach(() => {
    registry = new RouteRegistry();
  });

  describe("initialization", () => {
    it("should start with an empty registry", () => {
      expect(registry.getAll()).toEqual([]);
      expect(registry.count()).toBe(0);
    });
  });

  describe("add()", () => {
    it("should add a valid route", () => {
      const route = registry.add(createRoute());

      expect(route).toMatchObject({
        path: "/api/users",
        methods: [ "GET" ],
        file: "src/routes/users.py",
        framework: "flask",
        line: 10,
        handler: "get_users"
      });

      expect(route.id).toBeTruthy();
      expect(registry.count()).toBe(1);
    });

    it("should trim the route path", () => {
      const route = registry.add(
        createRoute({ path: "  /api/users  " })
      );

      expect(route.path).toBe("/api/users");
    });

    it("should normalize HTTP methods", () => {
      const route = registry.add(
        createRoute({
          methods: [ "get", "post", "GET", " patch " ]
        })
      );

      expect(route.methods).toEqual([
        "GET",
        "PATCH",
        "POST"
      ]);
    });

    it("should use default values for optional fields", () => {
      const route = registry.add({
        path: "/health",
        methods: [ "GET" ],
        file: "app.py"
      });

      expect(route).toMatchObject({
        framework: "unknown",
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

    it("should generate a deterministic route ID", () => {
      const route = registry.add(
        createRoute({
          methods: [ "post", "get" ]
        })
      );

      expect(route.id).toBe(
        "flask::src/routes/users.py::/api/users::GET,POST::10"
      );
    });

    it("should replace a route with the same ID", () => {
      const added = registry.add(createRoute());

      const updated = registry.add(
        createRoute({
          handler: "list_users"
        })
      );

      expect(registry.count()).toBe(1);
      expect(updated.id).toBe(added.id);
      expect(registry.get(added.id).handler).toBe("list_users");
    });

    it("should reject a non-object route", () => {
      expect(() => registry.add(null)).toThrow(TypeError);
      expect(() => registry.add("invalid")).toThrow(TypeError);
    });

    it("should reject an empty path", () => {
      expect(() =>
        registry.add(createRoute({ path: " " }))
      ).toThrow(TypeError);
    });

    it("should reject missing or invalid methods", () => {
      expect(() =>
        registry.add(createRoute({ methods: [] }))
      ).toThrow(TypeError);

      expect(() =>
        registry.add(createRoute({ methods: "GET" }))
      ).toThrow(TypeError);
    });

    it("should reject an empty file path", () => {
      expect(() =>
        registry.add(createRoute({ file: "" }))
      ).toThrow(TypeError);
    });
  });

  describe("addMany()", () => {
    it("should add multiple routes", () => {
      const routes = registry.addMany([
        createRoute(),
        createRoute({
          path: "/api/users/:id",
          methods: [ "GET" ],
          line: 20
        })
      ]);

      expect(routes).toHaveLength(2);
      expect(registry.count()).toBe(2);
    });

    it("should return an empty array for an empty input", () => {
      expect(registry.addMany([])).toEqual([]);
      expect(registry.count()).toBe(0);
    });
  });

  describe("get()", () => {
    it("should return a route by ID", () => {
      const added = registry.add(createRoute());

      expect(registry.get(added.id)).toEqual(added);
    });

    it("should return null for an unknown ID", () => {
      expect(registry.get("missing-route")).toBeNull();
    });
  });

  describe("getAll()", () => {
    it("should return all registered routes", () => {
      registry.addMany([
        createRoute(),
        createRoute({
          path: "/api/products",
          line: 20
        })
      ]);

      expect(registry.getAll()).toHaveLength(2);
    });

    it("should return a new array", () => {
      registry.add(createRoute());

      const first = registry.getAll();
      const second = registry.getAll();

      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  describe("find()", () => {
    it("should filter routes using a predicate", () => {
      registry.addMany([
        createRoute({
          path: "/api/users",
          methods: [ "GET" ]
        }),
        createRoute({
          path: "/api/users",
          methods: [ "POST" ],
          line: 20
        }),
        createRoute({
          path: "/api/products",
          methods: [ "GET" ],
          line: 30
        })
      ]);

      const getRoutes = registry.find(route =>
        route.methods.includes("GET")
      );

      expect(getRoutes).toHaveLength(2);
    });

    it("should reject a non-function predicate", () => {
      expect(() => registry.find("GET")).toThrow(TypeError);
    });
  });

  describe("remove()", () => {
    it("should remove an existing route", () => {
      const route = registry.add(createRoute());

      expect(registry.remove(route.id)).toBe(true);
      expect(registry.get(route.id)).toBeNull();
      expect(registry.count()).toBe(0);
    });

    it("should return false for an unknown route ID", () => {
      expect(registry.remove("missing-route")).toBe(false);
    });
  });

  describe("removeMany()", () => {
    it("should remove multiple routes", () => {
      const routes = registry.addMany([
        createRoute(),
        createRoute({
          path: "/api/products",
          line: 20
        }),
        createRoute({
          path: "/api/orders",
          line: 30
        })
      ]);

      const removed = registry.removeMany(
        routes.slice(0, 2).map(route => route.id)
      );

      expect(removed).toBe(2);
      expect(registry.count()).toBe(1);
    });
  });

  describe("clear()", () => {
    it("should remove all routes", () => {
      registry.addMany([
        createRoute(),
        createRoute({
          path: "/api/products",
          line: 20
        })
      ]);

      expect(registry.clear()).toBe(2);
      expect(registry.count()).toBe(0);
    });

    it("should return zero when already empty", () => {
      expect(registry.clear()).toBe(0);
    });
  });

  describe("events", () => {
    it("should emit route:added when a route is added", () => {
      const callback = vi.fn();

      registry.subscribe("route:added", callback);

      const route = registry.add(createRoute());

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(route);
    });

    it("should emit route:updated when a route is replaced", () => {
      const added = registry.add(createRoute());
      const callback = vi.fn();

      registry.subscribe("route:updated", callback);

      const updated = registry.add(
        createRoute({
          handler: "updated_handler"
        })
      );

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(updated);
      expect(updated.id).toBe(added.id);
    });

    it("should emit route:removed when a route is removed", () => {
      const route = registry.add(createRoute());
      const callback = vi.fn();

      registry.subscribe("route:removed", callback);
      registry.remove(route.id);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(route);
    });

    it("should emit routes:cleared when routes are cleared", () => {
      const route = registry.add(createRoute());
      const callback = vi.fn();

      registry.subscribe("routes:cleared", callback);
      registry.clear();

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith([ route ]);
    });

    it("should stop notifications after unsubscribe", () => {
      const callback = vi.fn();

      const unsubscribe = registry.subscribe(
        "route:added",
        callback
      );

      unsubscribe();
      registry.add(createRoute());

      expect(callback).not.toHaveBeenCalled();
    });

    it("should reject a non-function callback", () => {
      expect(() =>
        registry.subscribe("route:added", null)
      ).toThrow(TypeError);
    });
  });

  describe("lifecycle", () => {
    it("should clear routes and listeners when destroyed", () => {
      registry.add(createRoute());

      registry.destroy();

      expect(registry.routes.size).toBe(0);
      expect(registry.listeners.size).toBe(0);
    });

    it("should reject operations after destruction", () => {
      registry.destroy();

      expect(() => registry.add(createRoute())).toThrow();
      expect(() => registry.getAll()).toThrow();
      expect(() => registry.count()).toThrow();
    });

    it("should allow destroy to be called more than once", () => {
      expect(() => {
        registry.destroy();
        registry.destroy();
      }).not.toThrow();
    });
  });
});
