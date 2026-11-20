import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import WorkspaceScanner from "../../src/core/WorkspaceScanner.js";

describe("WorkspaceScanner", () => {
  let scanner;
  let routeRegistry;
  let scannerRegistry;
  let flaskScanner;
  let expressScanner;

  const workspace = {
    root: "/project",
    name: "test-project"
  };

  const createRoute = (overrides = {}) => ({
    path: "/api/users",
    methods: [ "GET" ],
    file: "/project/app.py",
    framework: "flask",
    line: 10,
    handler: "get_users",
    ...overrides
  });

  beforeEach(() => {
    routeRegistry = {
      replaceAll: vi.fn(routes => routes)
    };

    flaskScanner = {
      id: "flask",
      framework: "flask",
      scan: vi.fn().mockResolvedValue([
        createRoute()
      ])
    };

    expressScanner = {
      id: "express",
      framework: "express",
      scan: vi.fn().mockResolvedValue([
        createRoute({
          path: "/api/products",
          file: "/project/server.js",
          framework: "express"
        })
      ])
    };

    scannerRegistry = {
      detect: vi.fn().mockResolvedValue([
        flaskScanner
      ]),
      destroy: vi.fn().mockResolvedValue(undefined)
    };

    scanner = new WorkspaceScanner({
      registry: routeRegistry,
      scannerRegistry
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with the provided route registry", () => {
      expect(scanner.routeRegistry).toBe(routeRegistry);
      expect(scanner.scannerRegistry).toBe(scannerRegistry);
      expect(scanner.destroyed).toBe(false);
      expect(scanner.scanning).toBe(false);
    });

    it("should create a scanner registry when one is not provided", () => {
      const instance = new WorkspaceScanner({
        registry: routeRegistry
      });

      expect(instance.scannerRegistry).toBeTruthy();
      expect(instance.scannerRegistry).not.toBe(scannerRegistry);
      expect(instance.ownsScannerRegistry).toBe(true);
      expect(instance.destroyed).toBe(false);
    });

    it("should reject initialization without a route registry", () => {
      expect(
        () => new WorkspaceScanner({})
      ).toThrow(
        "WorkspaceScanner requires a RouteRegistry."
      );
    });

    it("should reject a route registry without replaceAll()", () => {
      expect(
        () => new WorkspaceScanner({
          registry: {
            addMany: vi.fn()
          }
        })
      ).toThrow(
        "RouteRegistry must implement replaceAll()."
      );
    });
  });

  describe("scan()", () => {
    it("should reject a missing workspace", async () => {
      await expect(
        scanner.scan(null)
      ).rejects.toThrow(
        "A valid workspace is required."
      );
    });

    it("should reject a workspace without a root path", async () => {
      await expect(
        scanner.scan({
          name: "invalid-project"
        })
      ).rejects.toThrow(
        "Workspace must contain a valid root path."
      );
    });

    it("should reject an empty workspace root", async () => {
      await expect(
        scanner.scan({
          root: ""
        })
      ).rejects.toThrow(
        "Workspace must contain a valid root path."
      );
    });

    it("should reject whitespace-only workspace roots", async () => {
      await expect(
        scanner.scan({
          root: "   "
        })
      ).rejects.toThrow(
        "Workspace must contain a valid root path."
      );
    });

    it("should reject invalid scan options", async () => {
      await expect(
        scanner.scan(workspace, null)
      ).rejects.toThrow(
        "Scan options must be an object."
      );

      await expect(
        scanner.scan(workspace, [])
      ).rejects.toThrow(
        "Scan options must be an object."
      );
    });

    it("should detect supported scanners", async () => {
      await scanner.scan(workspace);

      expect(
        scannerRegistry.detect
      ).toHaveBeenCalledWith(workspace, {});
    });

    it("should pass scan options to scanner detection", async () => {
      const options = {
        extensions: [ ".py" ],
        maxFiles: 100
      };

      await scanner.scan(workspace, options);

      expect(
        scannerRegistry.detect
      ).toHaveBeenCalledWith(
        workspace,
        options
      );
    });

    it("should scan detected frameworks", async () => {
      await scanner.scan(workspace);

      expect(
        flaskScanner.scan
      ).toHaveBeenCalledWith(workspace, {});

      expect(
        expressScanner.scan
      ).not.toHaveBeenCalled();
    });

    it("should replace discovered routes in the route registry", async () => {
      await scanner.scan(workspace);

      expect(
        routeRegistry.replaceAll
      ).toHaveBeenCalledWith([
        createRoute()
      ]);
    });

    it("should return a scan summary", async () => {
      const result = await scanner.scan(workspace);

      expect(result).toMatchObject({
        workspace: "/project",
        scannerCount: 1,
        routeCount: 1,
        routes: [
          createRoute()
        ]
      });

      expect(typeof result.scannedAt).toBe("number");
    });

    it("should handle a scanner that returns no routes", async () => {
      flaskScanner.scan.mockResolvedValue([]);

      const result = await scanner.scan(workspace);

      expect(result.routeCount).toBe(0);
      expect(result.routes).toEqual([]);

      expect(
        routeRegistry.replaceAll
      ).toHaveBeenCalledWith([]);
    });

    it("should handle multiple detected scanners", async () => {
      scannerRegistry.detect.mockResolvedValue([
        flaskScanner,
        expressScanner
      ]);

      const result = await scanner.scan(workspace);

      expect(
        flaskScanner.scan
      ).toHaveBeenCalled();

      expect(
        expressScanner.scan
      ).toHaveBeenCalled();

      expect(result.scannerCount).toBe(2);
      expect(result.routeCount).toBe(2);
      expect(result.routes).toHaveLength(2);
    });

    it("should pass scan options to detected scanners", async () => {
      const options = {
        extensions: [ ".py" ],
        maxFiles: 100
      };

      await scanner.scan(workspace, options);

      expect(
        flaskScanner.scan
      ).toHaveBeenCalledWith(
        workspace,
        options
      );
    });

    it("should log scanner errors and continue scanning", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      flaskScanner.scan.mockRejectedValue(
        new Error("Scanner failure")
      );

      scannerRegistry.detect.mockResolvedValue([
        flaskScanner,
        expressScanner
      ]);

      const result = await scanner.scan(workspace);

      expect(consoleError).toHaveBeenCalledWith(
        "[RouteLens] Scanner failed (flask):",
        expect.any(Error)
      );

      expect(
        expressScanner.scan
      ).toHaveBeenCalled();

      expect(result.routeCount).toBe(1);
      expect(result.routes[ 0 ].framework).toBe("express");
    });

    it("should log invalid scanner results and continue scanning", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      flaskScanner.scan.mockResolvedValue({
        path: "/invalid"
      });

      scannerRegistry.detect.mockResolvedValue([
        flaskScanner,
        expressScanner
      ]);

      const result = await scanner.scan(workspace);

      expect(consoleError).toHaveBeenCalledWith(
        "[RouteLens] Scanner failed (flask):",
        expect.any(TypeError)
      );

      expect(expressScanner.scan).toHaveBeenCalled();
      expect(result.routeCount).toBe(1);
      expect(result.routes[ 0 ].framework).toBe("express");
    });

    it("should reject when scanner detection returns a non-array", async () => {
      scannerRegistry.detect.mockResolvedValue(null);

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow(
        "ScannerRegistry.detect() must return an array."
      );

      expect(
        routeRegistry.replaceAll
      ).not.toHaveBeenCalled();

      expect(scanner.isScanning()).toBe(false);
    });

    it("should ignore scanners without a scan method", async () => {
      scannerRegistry.detect.mockResolvedValue([
        {
          id: "invalid-scanner"
        },
        flaskScanner
      ]);

      const result = await scanner.scan(workspace);

      expect(flaskScanner.scan).toHaveBeenCalled();
      expect(result.routeCount).toBe(1);
    });

    it("should prevent concurrent scans", async () => {
      let resolveScan;

      flaskScanner.scan.mockImplementation(
        () =>
          new Promise(resolve => {
            resolveScan = resolve;
          })
      );

      const firstScan = scanner.scan(workspace);

      await Promise.resolve();
      await Promise.resolve();

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow(
        "A workspace scan is already in progress."
      );

      resolveScan([ createRoute() ]);

      await firstScan;
    });

    it("should reset scanning state after completion", async () => {
      await scanner.scan(workspace);

      expect(scanner.isScanning()).toBe(false);
    });

    it("should reset scanning state after an unexpected error", async () => {
      scannerRegistry.detect.mockRejectedValue(
        new Error("Detection failure")
      );

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow("Detection failure");

      expect(scanner.isScanning()).toBe(false);
    });

    it("should preserve the previous result when detection fails", async () => {
      const previousResult = await scanner.scan(workspace);

      scannerRegistry.detect.mockRejectedValue(
        new Error("Detection failure")
      );

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow("Detection failure");

      expect(scanner.getLastResult()).toBe(previousResult);

      expect(
        routeRegistry.replaceAll
      ).toHaveBeenCalledOnce();
    });

    it("should reject scans after destruction", async () => {
      await scanner.destroy();

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow(
        "WorkspaceScanner has been destroyed."
      );
    });

    it("should not commit results when destroyed during detection", async () => {
      let resolveDetection;

      scannerRegistry.detect.mockReturnValue(
        new Promise(resolve => {
          resolveDetection = resolve;
        })
      );

      const scanPromise = scanner.scan(workspace);

      await Promise.resolve();

      await scanner.destroy();

      resolveDetection([ flaskScanner ]);

      await expect(
        scanPromise
      ).rejects.toThrow(
        "WorkspaceScanner has been destroyed."
      );

      expect(
        routeRegistry.replaceAll
      ).not.toHaveBeenCalled();

      expect(scanner.isScanning()).toBe(false);
    });
  });

  describe("getLastResult()", () => {
    it("should return null before the first scan", () => {
      expect(scanner.getLastResult()).toBeNull();
    });

    it("should return the most recent scan result", async () => {
      const result = await scanner.scan(workspace);

      expect(scanner.getLastResult()).toBe(result);
    });

    it("should reject access after destruction", async () => {
      await scanner.destroy();

      expect(() => {
        scanner.getLastResult();
      }).toThrow(
        "WorkspaceScanner has been destroyed."
      );
    });
  });

  describe("isScanning()", () => {
    it("should return false when idle", () => {
      expect(scanner.isScanning()).toBe(false);
    });

    it("should return true while scanning", async () => {
      let resolveScan;

      flaskScanner.scan.mockImplementation(
        () =>
          new Promise(resolve => {
            resolveScan = resolve;
          })
      );

      const scanPromise = scanner.scan(workspace);

      await Promise.resolve();
      await Promise.resolve();

      expect(scanner.isScanning()).toBe(true);

      resolveScan([]);

      await scanPromise;

      expect(scanner.isScanning()).toBe(false);
    });
  });

  describe("lifecycle", () => {
    it("should not destroy an injected scanner registry", async () => {
      await scanner.destroy();

      expect(
        scannerRegistry.destroy
      ).not.toHaveBeenCalled();

      expect(scanner.destroyed).toBe(true);
      expect(scanner.routeRegistry).toBeNull();
      expect(scanner.scannerRegistry).toBeNull();
      expect(scanner.lastResult).toBeNull();
    });

    it("should destroy a scanner registry it created itself", async () => {
      const instance = new WorkspaceScanner({
        registry: routeRegistry
      });

      const destroySpy = vi.spyOn(
        instance.scannerRegistry,
        "destroy"
      );

      await instance.destroy();

      expect(destroySpy).toHaveBeenCalledOnce();
      expect(instance.scannerRegistry).toBeNull();
    });

    it("should allow repeated destruction", async () => {
      await scanner.destroy();
      await scanner.destroy();

      expect(
        scannerRegistry.destroy
      ).not.toHaveBeenCalled();
    });

    it("should not fail when the scanner registry has no destroy method", async () => {
      scanner.scannerRegistry = {
        detect: vi.fn()
      };

      await expect(
        scanner.destroy()
      ).resolves.toBeUndefined();
    });

    it("should report not scanning after destruction", async () => {
      await scanner.destroy();

      expect(scanner.isScanning()).toBe(false);
    });
  });
});
