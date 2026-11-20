import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteNavigator from "../../src/navigation/RouteNavigator.js";

describe("RouteNavigator", () => {
  let navigator;
  let editorAdapter;
  let sourceLocator;

  const createRoute = (overrides = {}) => ({
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    file: "routes/users.js",
    line: 10,
    handler: "getUsers",
    ...overrides
  });

  const createLocation = (overrides = {}) => ({
    file: "routes/users.js",
    line: 10,
    handler: "getUsers",
    type: "route",
    ...overrides
  });

  beforeEach(() => {
    editorAdapter = {
      openFile: vi.fn().mockResolvedValue(true),
      goToLine: vi.fn().mockResolvedValue(true)
    };

    sourceLocator = {
      locate: vi.fn(() => createLocation()),
      locateHandler: vi.fn(async () =>
        createLocation({
          type: "handler"
        })
      ),
      destroy: vi.fn()
    };

    navigator = new RouteNavigator({
      editorAdapter,
      sourceLocator
    });
  });

  afterEach(() => {
    if (navigator && !navigator.destroyed) {
      navigator.destroy();
    }

    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should require an EditorAdapter", () => {
      expect(() => new RouteNavigator()).toThrow(
        "RouteNavigator requires an EditorAdapter."
      );
    });

    it("should reject a null EditorAdapter", () => {
      expect(() =>
        new RouteNavigator({
          editorAdapter: null
        })
      ).toThrow(
        "RouteNavigator requires an EditorAdapter."
      );
    });

    it("should store the provided EditorAdapter", () => {
      expect(navigator.editorAdapter).toBe(editorAdapter);
    });

    it("should store the provided SourceLocator", () => {
      expect(navigator.sourceLocator).toBe(sourceLocator);
    });

    it("should create a default SourceLocator", () => {
      const instance = new RouteNavigator({
        editorAdapter
      });

      expect(instance.sourceLocator).toBeDefined();
      expect(instance.sourceLocator).not.toBeNull();

      instance.destroy();
    });

    it("should initialize without being destroyed", () => {
      expect(navigator.destroyed).toBe(false);
    });

    it("should initialize lastNavigation as null", () => {
      expect(navigator.lastNavigation).toBeNull();
    });
  });

  describe("navigate()", () => {
    it("should open the route source file", async () => {
      await navigator.navigate(createRoute());

      expect(editorAdapter.openFile).toHaveBeenCalledWith(
        "routes/users.js"
      );
    });

    it("should locate the route source", async () => {
      const route = createRoute();

      await navigator.navigate(route);

      expect(sourceLocator.locate).toHaveBeenCalledWith(route);
    });

    it("should navigate to the route source line", async () => {
      await navigator.navigate(createRoute());

      expect(editorAdapter.goToLine).toHaveBeenCalledWith(10);
    });

    it("should not navigate to a line when the location has no line", async () => {
      sourceLocator.locate.mockReturnValue(
        createLocation({
          line: null
        })
      );

      await navigator.navigate(createRoute());

      expect(editorAdapter.goToLine).not.toHaveBeenCalled();
    });

    it("should not require goToLine() to be implemented", async () => {
      delete editorAdapter.goToLine;

      await expect(
        navigator.navigate(createRoute())
      ).resolves.toMatchObject({
        file: "routes/users.js"
      });
    });

    it("should allow openFile() to resolve undefined", async () => {
      editorAdapter.openFile.mockResolvedValue(undefined);

      await expect(
        navigator.navigate(createRoute())
      ).resolves.toMatchObject({
        file: "routes/users.js"
      });
    });

    it("should reject when the source location cannot be determined", async () => {
      sourceLocator.locate.mockReturnValue(null);

      await expect(
        navigator.navigate(createRoute())
      ).rejects.toThrow(
        "Unable to determine the route's source location."
      );
    });

    it("should reject when openFile() is not implemented", async () => {
      delete editorAdapter.openFile;

      await expect(
        navigator.navigate(createRoute())
      ).rejects.toThrow(
        "EditorAdapter must implement openFile()."
      );
    });

    it("should reject when the source file cannot be opened", async () => {
      editorAdapter.openFile.mockResolvedValue(false);

      await expect(
        navigator.navigate(createRoute())
      ).rejects.toThrow(
        "Unable to open source file: routes/users.js"
      );
    });

    it("should not navigate to a line when opening the file fails", async () => {
      editorAdapter.openFile.mockResolvedValue(false);

      await expect(
        navigator.navigate(createRoute())
      ).rejects.toThrow();

      expect(editorAdapter.goToLine).not.toHaveBeenCalled();
    });

    it("should propagate openFile() errors", async () => {
      editorAdapter.openFile.mockRejectedValue(
        new Error("Editor failed.")
      );

      await expect(
        navigator.navigate(createRoute())
      ).rejects.toThrow("Editor failed.");
    });

    it("should propagate goToLine() errors", async () => {
      editorAdapter.goToLine.mockRejectedValue(
        new Error("Navigation failed.")
      );

      await expect(
        navigator.navigate(createRoute())
      ).rejects.toThrow("Navigation failed.");
    });

    it("should record the completed navigation", async () => {
      const result = await navigator.navigate(createRoute());

      expect(result).toMatchObject({
        routeId: "route-1",
        file: "routes/users.js",
        line: 10
      });

      expect(result.navigatedAt).toEqual(expect.any(Number));
    });

    it("should save the last navigation", async () => {
      const result = await navigator.navigate(createRoute());

      expect(navigator.lastNavigation).toBe(result);
    });

    it("should use null when the route has no ID", async () => {
      const result = await navigator.navigate(
        createRoute({
          id: undefined
        })
      );

      expect(result.routeId).toBeNull();
    });

    it("should replace the previous navigation result", async () => {
      const first = await navigator.navigate(createRoute());

      sourceLocator.locate.mockReturnValue(
        createLocation({
          file: "routes/products.js",
          line: 20
        })
      );

      const second = await navigator.navigate(
        createRoute({
          id: "route-2"
        })
      );

      expect(second).not.toBe(first);
      expect(navigator.lastNavigation).toBe(second);
      expect(second.file).toBe("routes/products.js");
    });

    it("should not update lastNavigation when opening fails", async () => {
      const first = await navigator.navigate(createRoute());

      editorAdapter.openFile.mockResolvedValue(false);

      await expect(
        navigator.navigate(createRoute())
      ).rejects.toThrow();

      expect(navigator.lastNavigation).toBe(first);
    });
  });

  describe("navigateToHandler()", () => {
    it("should resolve the handler location before opening the file", async () => {
      const handlerLocation = createLocation({
        file: "controllers/UserController.js",
        line: 25,
        type: "handler"
      });

      sourceLocator.locateHandler.mockResolvedValue(
        handlerLocation
      );

      await navigator.navigateToHandler(createRoute());

      expect(editorAdapter.openFile).toHaveBeenCalledWith(
        "controllers/UserController.js"
      );
    });

    it("should await the asynchronous handler lookup", async () => {
      sourceLocator.locateHandler.mockImplementation(
        async () => {
          await Promise.resolve();

          return createLocation({
            file: "controllers/UserController.js",
            line: 25,
            type: "handler"
          });
        }
      );

      const result = await navigator.navigateToHandler(
        createRoute()
      );

      expect(result.file).toBe(
        "controllers/UserController.js"
      );

      expect(result.line).toBe(25);
    });

    it("should call locateHandler() with the route", async () => {
      const route = createRoute();

      sourceLocator.locateHandler.mockResolvedValue(
        createLocation()
      );

      await navigator.navigateToHandler(route);

      expect(sourceLocator.locateHandler).toHaveBeenCalledWith(
        route
      );
    });

    it("should navigate to the handler line", async () => {
      sourceLocator.locateHandler.mockResolvedValue(
        createLocation({
          line: 25
        })
      );

      await navigator.navigateToHandler(createRoute());

      expect(editorAdapter.goToLine).toHaveBeenCalledWith(25);
    });

    it("should not navigate to a line when the handler location has no line", async () => {
      sourceLocator.locateHandler.mockResolvedValue(
        createLocation({
          line: null
        })
      );

      await navigator.navigateToHandler(createRoute());

      expect(editorAdapter.goToLine).not.toHaveBeenCalled();
    });

    it("should not require goToLine() to be implemented", async () => {
      delete editorAdapter.goToLine;

      sourceLocator.locateHandler.mockResolvedValue(
        createLocation()
      );

      await expect(
        navigator.navigateToHandler(createRoute())
      ).resolves.toMatchObject({
        file: "routes/users.js"
      });
    });

    it("should fall back to route navigation when no handler is found", async () => {
      sourceLocator.locateHandler.mockResolvedValue(null);

      const result = await navigator.navigateToHandler(
        createRoute()
      );

      expect(sourceLocator.locate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "route-1"
        })
      );

      expect(result).toMatchObject({
        file: "routes/users.js",
        line: 10
      });

      expect(result.target).toBeUndefined();
    });

    it("should propagate handler lookup errors", async () => {
      sourceLocator.locateHandler.mockRejectedValue(
        new Error("Handler lookup failed.")
      );

      await expect(
        navigator.navigateToHandler(createRoute())
      ).rejects.toThrow("Handler lookup failed.");
    });

    it("should reject when the handler file cannot be opened", async () => {
      sourceLocator.locateHandler.mockResolvedValue(
        createLocation({
          file: "controllers/UserController.js"
        })
      );

      editorAdapter.openFile.mockResolvedValue(false);

      await expect(
        navigator.navigateToHandler(createRoute())
      ).rejects.toThrow(
        "Unable to open handler file: controllers/UserController.js"
      );
    });

    it("should propagate handler file opening errors", async () => {
      sourceLocator.locateHandler.mockResolvedValue(
        createLocation()
      );

      editorAdapter.openFile.mockRejectedValue(
        new Error("Cannot open handler file.")
      );

      await expect(
        navigator.navigateToHandler(createRoute())
      ).rejects.toThrow("Cannot open handler file.");
    });

    it("should propagate handler line navigation errors", async () => {
      sourceLocator.locateHandler.mockResolvedValue(
        createLocation()
      );

      editorAdapter.goToLine.mockRejectedValue(
        new Error("Cannot navigate to handler.")
      );

      await expect(
        navigator.navigateToHandler(createRoute())
      ).rejects.toThrow("Cannot navigate to handler.");
    });

    it("should record the handler navigation target", async () => {
      sourceLocator.locateHandler.mockResolvedValue(
        createLocation({
          file: "controllers/UserController.js",
          line: 25
        })
      );

      const result = await navigator.navigateToHandler(
        createRoute()
      );

      expect(result).toMatchObject({
        routeId: "route-1",
        file: "controllers/UserController.js",
        line: 25,
        target: "handler"
      });

      expect(result.navigatedAt).toEqual(expect.any(Number));
    });

    it("should save the handler navigation result", async () => {
      sourceLocator.locateHandler.mockResolvedValue(
        createLocation()
      );

      const result = await navigator.navigateToHandler(
        createRoute()
      );

      expect(navigator.lastNavigation).toBe(result);
    });

    it("should not update lastNavigation when handler opening fails", async () => {
      const first = await navigator.navigate(createRoute());

      sourceLocator.locateHandler.mockResolvedValue(
        createLocation({
          file: "controllers/UserController.js"
        })
      );

      editorAdapter.openFile.mockResolvedValue(false);

      await expect(
        navigator.navigateToHandler(createRoute())
      ).rejects.toThrow();

      expect(navigator.lastNavigation).toBe(first);
    });
  });

  describe("getLastNavigation()", () => {
    it("should initially return null", () => {
      expect(navigator.getLastNavigation()).toBeNull();
    });

    it("should return the latest navigation result", async () => {
      const result = await navigator.navigate(createRoute());

      expect(navigator.getLastNavigation()).toBe(result);
    });
  });

  describe("validateRoute()", () => {
    it("should accept a valid route", () => {
      expect(() =>
        navigator.validateRoute(createRoute())
      ).not.toThrow();
    });

    it.each([
      null,
      undefined,
      [],
      "invalid",
      {},
      { file: "" },
      { file: "   " },
      { file: null },
      { file: 123 }
    ])("should reject invalid routes (%s)", (route) => {
      expect(() =>
        navigator.validateRoute(route)
      ).toThrow(
        "A valid route with a source file is required."
      );
    });
  });

  describe("lifecycle", () => {
    it("should mark the navigator as destroyed", () => {
      navigator.destroy();

      expect(navigator.destroyed).toBe(true);
    });

    it("should not destroy an injected SourceLocator", () => {
      navigator.destroy();

      expect(sourceLocator.destroy).not.toHaveBeenCalled();
    });

    it("should destroy an internally-created SourceLocator", () => {
      const instance = new RouteNavigator({
        editorAdapter
      });

      const locator = instance.sourceLocator;
      const destroySpy = vi.spyOn(locator, "destroy");

      instance.destroy();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("should clear the EditorAdapter reference", () => {
      navigator.destroy();

      expect(navigator.editorAdapter).toBeNull();
    });

    it("should clear the SourceLocator reference", () => {
      navigator.destroy();

      expect(navigator.sourceLocator).toBeNull();
    });

    it("should clear the last navigation", async () => {
      await navigator.navigate(createRoute());

      navigator.destroy();

      expect(navigator.lastNavigation).toBeNull();
    });

    it("should allow destroy() to be called more than once", () => {
      navigator.destroy();

      expect(() => navigator.destroy()).not.toThrow();

      expect(sourceLocator.destroy).not.toHaveBeenCalled();
    });

    it("should handle a SourceLocator without destroy()", () => {
      const instance = new RouteNavigator({
        editorAdapter,
        sourceLocator: {
          locate: vi.fn(() => createLocation()),
          locateHandler: vi.fn(async () => null)
        }
      });

      expect(() => instance.destroy()).not.toThrow();
    });

    it("should throw when navigate() is called after destruction", async () => {
      navigator.destroy();

      await expect(
        navigator.navigate(createRoute())
      ).rejects.toThrow(
        "RouteNavigator has been destroyed."
      );
    });

    it("should throw when navigateToHandler() is called after destruction", async () => {
      navigator.destroy();

      await expect(
        navigator.navigateToHandler(createRoute())
      ).rejects.toThrow(
        "RouteNavigator has been destroyed."
      );
    });

    it("should throw when getLastNavigation() is called after destruction", () => {
      navigator.destroy();

      expect(() =>
        navigator.getLastNavigation()
      ).toThrow(
        "RouteNavigator has been destroyed."
      );
    });
  });
});
