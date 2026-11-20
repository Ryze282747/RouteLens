import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

const mocks = vi.hoisted(() => ({
  instances: {
    acodeAdapters: [],
    fileSystems: [],
    scannerRegistries: [],
    routeRegistries: [],
    workspaceManagers: [],
    workspaceScanners: [],
    eventManagers: [],
    flaskScanners: [],
    expressScanners: [],
    laravelScanners: []
  },

  workspace: {
    root: "/project",
    name: "project",
    uri: null,
    source: "acode"
  },

  workspaceInit: vi.fn(),
  workspaceRefresh: vi.fn(),
  workspaceGet: vi.fn(),

  workspaceScan: vi.fn(),

  routeGetAll: vi.fn(),
  routeGet: vi.fn(),

  scannerRegister: vi.fn(),

  eventOn: vi.fn(),
  eventOnce: vi.fn(),
  eventEmit: vi.fn()
}));

vi.mock("../../src/adapters/AcodeAdapter.js", () => ({
  default: class AcodeAdapter {
    constructor() {
      mocks.instances.acodeAdapters.push(this);
    }

    async getWorkspace() {
      return mocks.workspace;
    }

    destroy() {
      this.destroyed = true;
    }
  }
}));

vi.mock("../../src/adapters/FileSystemAdapter.js", () => ({
  default: class FileSystemAdapter {
    constructor() {
      mocks.instances.fileSystems.push(this);
    }

    async findFiles() {
      return [];
    }

    async readFile() {
      return "";
    }

    destroy() {
      this.destroyed = true;
    }
  }
}));

vi.mock("../../src/scanners/ScannerRegistry.js", () => ({
  default: class ScannerRegistry {
    constructor() {
      this.scanners = new Map();
      mocks.instances.scannerRegistries.push(this);
    }

    register(scanner) {
      mocks.scannerRegister(scanner);
      this.scanners.set(scanner.id, scanner);
      return scanner;
    }

    get(id) {
      return this.scanners.get(id) || null;
    }

    getAll() {
      return Array.from(this.scanners.values());
    }

    async detect() {
      return [];
    }

    async destroy() {
      this.destroyed = true;

      for (const scanner of this.scanners.values()) {
        scanner.destroy();
      }

      this.scanners.clear();
    }
  }
}));

vi.mock("../../src/scanners/flask/FlaskScanner.js", () => ({
  default: class FlaskScanner {
    constructor(options) {
      this.id = "flask";
      this.options = options;
      this.destroyed = false;

      mocks.instances.flaskScanners.push(this);
    }

    async detect() {
      return false;
    }

    async scan() {
      return [];
    }

    destroy() {
      this.destroyed = true;
    }
  }
}));

vi.mock("../../src/scanners/express/ExpressScanner.js", () => ({
  default: class ExpressScanner {
    constructor(options) {
      this.id = "express";
      this.options = options;
      this.destroyed = false;

      mocks.instances.expressScanners.push(this);
    }

    async detect() {
      return false;
    }

    async scan() {
      return [];
    }

    destroy() {
      this.destroyed = true;
    }
  }
}));

vi.mock("../../src/scanners/laravel/LaravelScanner.js", () => ({
  default: class LaravelScanner {
    constructor(options) {
      this.id = "laravel";
      this.options = options;
      this.destroyed = false;

      mocks.instances.laravelScanners.push(this);
    }

    async detect() {
      return false;
    }

    async scan() {
      return [];
    }

    destroy() {
      this.destroyed = true;
    }
  }
}));

vi.mock("../../src/core/RouteRegistry.js", () => ({
  default: class RouteRegistry {
    constructor() {
      this.listeners = new Map();
      this.routes = [];

      mocks.instances.routeRegistries.push(this);
    }

    subscribe(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }

      this.listeners.get(event).add(callback);

      return () => {
        this.listeners.get(event)?.delete(callback);
      };
    }

    emit(event, data) {
      for (const callback of this.listeners.get(event) || []) {
        callback(data);
      }
    }

    getAll() {
      return mocks.routeGetAll();
    }

    get(id) {
      return mocks.routeGet(id);
    }

    destroy() {
      this.destroyed = true;
      this.listeners.clear();
    }
  }
}));

vi.mock("../../src/core/WorkspaceManager.js", () => ({
  default: class WorkspaceManager {
    constructor(options) {
      this.options = options;
      this.listeners = new Set();

      mocks.instances.workspaceManagers.push(this);
    }

    async init() {
      return mocks.workspaceInit();
    }

    async refresh() {
      return mocks.workspaceRefresh();
    }

    getWorkspace() {
      return mocks.workspaceGet();
    }

    subscribe(callback) {
      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    emit(event) {
      for (const callback of this.listeners) {
        callback(event);
      }
    }

    destroy() {
      this.destroyed = true;
      this.listeners.clear();
    }
  }
}));

vi.mock("../../src/core/WorkspaceScanner.js", () => ({
  default: class WorkspaceScanner {
    constructor(options) {
      this.options = options;

      mocks.instances.workspaceScanners.push(this);
    }

    async scan(workspace, options) {
      return mocks.workspaceScan(workspace, options);
    }

    async destroy() {
      this.destroyed = true;
    }
  }
}));

vi.mock("../../src/core/EventManager.js", () => ({
  default: class EventManager {
    constructor() {
      this.listeners = new Map();

      mocks.instances.eventManagers.push(this);
    }

    emit(event, data) {
      mocks.eventEmit(event, data);

      for (const callback of this.listeners.get(event) || []) {
        callback(data);
      }
    }

    on(event, callback) {
      mocks.eventOn(event, callback);

      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }

      this.listeners.get(event).add(callback);

      return () => {
        this.listeners.get(event)?.delete(callback);
      };
    }

    once(event, callback) {
      mocks.eventOnce(event, callback);

      const unsubscribe = this.on(event, (data) => {
        unsubscribe();
        callback(data);
      });

      return unsubscribe;
    }

    destroy() {
      this.destroyed = true;
      this.listeners.clear();
    }
  }
}));

import RouteLensController from "../../src/core/RouteLensController.js";

function resetMocks() {
  for (const key of Object.keys(mocks.instances)) {
    mocks.instances[ key ] = [];
  }

  mocks.workspace = {
    root: "/project",
    name: "project",
    uri: null,
    source: "acode"
  };

  mocks.workspaceInit.mockReset();
  mocks.workspaceInit.mockResolvedValue(mocks.workspace);

  mocks.workspaceRefresh.mockReset();
  mocks.workspaceRefresh.mockResolvedValue(mocks.workspace);

  mocks.workspaceGet.mockReset();
  mocks.workspaceGet.mockReturnValue(mocks.workspace);

  mocks.workspaceScan.mockReset();
  mocks.workspaceScan.mockResolvedValue({
    workspace: "/project",
    scannerCount: 3,
    routeCount: 0,
    routes: [],
    scannedAt: 123
  });

  mocks.routeGetAll.mockReset();
  mocks.routeGetAll.mockReturnValue([]);

  mocks.routeGet.mockReset();
  mocks.routeGet.mockReturnValue(null);

  mocks.scannerRegister.mockReset();

  mocks.eventOn.mockReset();
  mocks.eventOnce.mockReset();
  mocks.eventEmit.mockReset();
}

describe("RouteLensController", () => {
  let controller;

  beforeEach(() => {
    resetMocks();
    controller = new RouteLensController();
  });

  describe("constructor", () => {
    it("should initialize with null components", () => {
      expect(controller.workspaceManager).toBeNull();
      expect(controller.workspaceScanner).toBeNull();
      expect(controller.routeRegistry).toBeNull();
      expect(controller.eventManager).toBeNull();
    });

    it("should not be initialized", () => {
      expect(controller.initialized).toBe(false);
    });

    it("should not be destroyed", () => {
      expect(controller.destroyed).toBe(false);
    });

    it("should have no initialization promise", () => {
      expect(controller.initPromise).toBeNull();
    });
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      await controller.init();

      expect(controller.initialized).toBe(true);
    });

    it("should create one AcodeAdapter", async () => {
      await controller.init();

      expect(mocks.instances.acodeAdapters).toHaveLength(1);
    });

    it("should create one FileSystemAdapter", async () => {
      await controller.init();

      expect(mocks.instances.fileSystems).toHaveLength(1);
    });

    it("should create one RouteRegistry", async () => {
      await controller.init();

      expect(mocks.instances.routeRegistries).toHaveLength(1);
    });

    it("should create one ScannerRegistry", async () => {
      await controller.init();

      expect(mocks.instances.scannerRegistries).toHaveLength(1);
    });

    it("should create one WorkspaceManager", async () => {
      await controller.init();

      expect(mocks.instances.workspaceManagers).toHaveLength(1);
    });

    it("should create one WorkspaceScanner", async () => {
      await controller.init();

      expect(mocks.instances.workspaceScanners).toHaveLength(1);
    });

    it("should initialize the workspace manager", async () => {
      await controller.init();

      expect(mocks.workspaceInit).toHaveBeenCalledTimes(1);
    });

    it("should inject AcodeAdapter into WorkspaceManager", async () => {
      await controller.init();

      const manager = mocks.instances.workspaceManagers[ 0 ];

      expect(manager.options.acodeAdapter).toBe(
        mocks.instances.acodeAdapters[ 0 ]
      );
    });

    it("should inject RouteRegistry into WorkspaceScanner", async () => {
      await controller.init();

      const scanner = mocks.instances.workspaceScanners[ 0 ];

      expect(scanner.options.registry).toBe(
        mocks.instances.routeRegistries[ 0 ]
      );
    });

    it("should inject ScannerRegistry into WorkspaceScanner", async () => {
      await controller.init();

      const scanner = mocks.instances.workspaceScanners[ 0 ];

      expect(scanner.options.scannerRegistry).toBe(
        mocks.instances.scannerRegistries[ 0 ]
      );
    });

    it("should register all three framework scanners", async () => {
      await controller.init();

      expect(mocks.scannerRegister).toHaveBeenCalledTimes(3);

      expect(
        mocks.scannerRegister.mock.calls.map(
          ([ scanner ]) => scanner.id
        )
      ).toEqual([
        "flask",
        "express",
        "laravel"
      ]);
    });

    it("should share one filesystem adapter across all scanners", async () => {
      await controller.init();

      const fileSystem = mocks.instances.fileSystems[ 0 ];

      expect(
        mocks.instances.flaskScanners[ 0 ].options.fileSystem
      ).toBe(fileSystem);

      expect(
        mocks.instances.expressScanners[ 0 ].options.fileSystem
      ).toBe(fileSystem);

      expect(
        mocks.instances.laravelScanners[ 0 ].options.fileSystem
      ).toBe(fileSystem);
    });

    it("should emit controller:initialized", async () => {
      await controller.init();

      expect(mocks.eventEmit).toHaveBeenCalledWith(
        "controller:initialized",
        {
          workspace: mocks.workspace
        }
      );
    });

    it("should not create duplicate components on repeated initialization", async () => {
      await controller.init();
      await controller.init();

      expect(mocks.instances.fileSystems).toHaveLength(1);
      expect(mocks.instances.scannerRegistries).toHaveLength(1);
      expect(mocks.instances.workspaceManagers).toHaveLength(1);
    });

    it("should reject initialization after destruction", async () => {
      await controller.destroy();

      await expect(controller.init()).rejects.toThrow(
        "Cannot initialize a destroyed RouteLensController."
      );
    });
  });

  describe("concurrent initialization", () => {
    it("should initialize only once when called concurrently", async () => {
      let resolveInitialization;

      mocks.workspaceInit.mockImplementation(
        () => new Promise((resolve) => {
          resolveInitialization = resolve;
        })
      );

      const first = controller.init();
      const second = controller.init();

      expect(mocks.instances.fileSystems).toHaveLength(1);
      expect(mocks.workspaceInit).toHaveBeenCalledTimes(1);

      resolveInitialization(mocks.workspace);

      await Promise.all([ first, second ]);

      expect(controller.initialized).toBe(true);
    });
  });

  describe("workspace operations", () => {
    it("should return the current workspace", async () => {
      await controller.init();

      expect(controller.getWorkspace()).toBe(mocks.workspace);
    });

    it("should refresh the workspace", async () => {
      await controller.init();

      const result = await controller.refreshWorkspace();

      expect(mocks.workspaceRefresh).toHaveBeenCalledTimes(1);
      expect(result).toBe(mocks.workspace);
    });

    it("should forward workspace changes", async () => {
      await controller.init();

      const event = {
        type: "workspace:changed",
        workspace: mocks.workspace,
        previousWorkspace: null
      };

      mocks.instances.workspaceManagers[ 0 ].emit(event);

      expect(mocks.eventEmit).toHaveBeenCalledWith(
        "workspace:changed",
        event
      );
    });
  });

  describe("route operations", () => {
    it("should return all routes", async () => {
      const routes = [
        { id: "route-1", path: "/users" }
      ];

      mocks.routeGetAll.mockReturnValue(routes);

      await controller.init();

      expect(controller.getRoutes()).toBe(routes);
    });

    it("should return a route by ID", async () => {
      const route = {
        id: "route-1",
        path: "/users"
      };

      mocks.routeGet.mockReturnValue(route);

      await controller.init();

      expect(controller.getRoute("route-1")).toBe(route);
      expect(mocks.routeGet).toHaveBeenCalledWith("route-1");
    });

    it("should forward route registry events", async () => {
      await controller.init();

      const route = {
        id: "route-1",
        path: "/users"
      };

      const registry = mocks.instances.routeRegistries[ 0 ];

      registry.emit("route:added", route);

      expect(mocks.eventEmit).toHaveBeenCalledWith(
        "route:added",
        route
      );
    });

    it("should forward routes:replaced events", async () => {
      await controller.init();

      const data = {
        previousRoutes: [],
        routes: []
      };

      mocks.instances.routeRegistries[ 0 ].emit(
        "routes:replaced",
        data
      );

      expect(mocks.eventEmit).toHaveBeenCalledWith(
        "routes:replaced",
        data
      );
    });
  });

  describe("scanWorkspace", () => {
    it("should scan the current workspace", async () => {
      await controller.init();

      const result = await controller.scanWorkspace();

      expect(mocks.workspaceScan).toHaveBeenCalledWith(
        mocks.workspace,
        {}
      );

      expect(result.routeCount).toBe(0);
    });

    it("should pass scan options", async () => {
      await controller.init();

      const options = {
        exclude: [ "dist" ]
      };

      await controller.scanWorkspace(options);

      expect(mocks.workspaceScan).toHaveBeenCalledWith(
        mocks.workspace,
        options
      );
    });

    it("should emit scan:started", async () => {
      await controller.init();

      await controller.scanWorkspace();

      expect(mocks.eventEmit).toHaveBeenCalledWith(
        "scan:started",
        {
          workspace: mocks.workspace,
          options: {}
        }
      );
    });

    it("should emit scan:completed", async () => {
      await controller.init();

      const result = await controller.scanWorkspace();

      expect(mocks.eventEmit).toHaveBeenCalledWith(
        "scan:completed",
        result
      );
    });

    it("should emit scan:failed when scanning fails", async () => {
      await controller.init();

      const error = new Error("Scan failed");

      mocks.workspaceScan.mockRejectedValueOnce(error);

      await expect(
        controller.scanWorkspace()
      ).rejects.toThrow("Scan failed");

      expect(mocks.eventEmit).toHaveBeenCalledWith(
        "scan:failed",
        {
          workspace: mocks.workspace,
          error
        }
      );
    });

    it("should reject invalid scan options", async () => {
      await controller.init();

      await expect(
        controller.scanWorkspace(null)
      ).rejects.toThrow("Scan options must be an object.");
    });

    it("should reject scan options that are arrays", async () => {
      await controller.init();

      await expect(
        controller.scanWorkspace([])
      ).rejects.toThrow("Scan options must be an object.");
    });
  });

  describe("event API", () => {
    it("should register an event listener", async () => {
      await controller.init();

      const callback = vi.fn();

      controller.on("custom:event", callback);

      expect(mocks.eventOn).toHaveBeenCalledWith(
        "custom:event",
        callback
      );
    });

    it("should register a one-time event listener", async () => {
      await controller.init();

      const callback = vi.fn();

      controller.once("custom:event", callback);

      expect(mocks.eventOnce).toHaveBeenCalledWith(
        "custom:event",
        callback
      );
    });
  });

  describe("initialization failure", () => {
    it("should reject when workspace initialization fails", async () => {
      mocks.workspaceInit.mockRejectedValueOnce(
        new Error("Workspace initialization failed")
      );

      await expect(controller.init()).rejects.toThrow(
        "Workspace initialization failed"
      );

      expect(controller.initialized).toBe(false);
    });

    it("should clean up partially initialized components", async () => {
      mocks.workspaceInit.mockRejectedValueOnce(
        new Error("Initialization failed")
      );

      await expect(controller.init()).rejects.toThrow();

      expect(
        mocks.instances.workspaceScanners[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.scannerRegistries[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.fileSystems[ 0 ].destroyed
      ).toBe(true);
    });

    it("should clear component references after initialization failure", async () => {
      mocks.workspaceInit.mockRejectedValueOnce(
        new Error("Initialization failed")
      );

      await expect(controller.init()).rejects.toThrow();

      expect(controller.workspaceScanner).toBeNull();
      expect(controller.scannerRegistry).toBeNull();
      expect(controller.fileSystem).toBeNull();
      expect(controller.workspaceManager).toBeNull();
      expect(controller.routeRegistry).toBeNull();
      expect(controller.eventManager).toBeNull();
    });
  });

  describe("destruction", () => {
    it("should destroy all components", async () => {
      await controller.init();

      await controller.destroy();

      expect(controller.destroyed).toBe(true);

      expect(
        mocks.instances.workspaceScanners[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.scannerRegistries[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.fileSystems[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.workspaceManagers[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.acodeAdapters[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.routeRegistries[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.eventManagers[ 0 ].destroyed
      ).toBe(true);
    });

    it("should destroy all registered framework scanners", async () => {
      await controller.init();

      await controller.destroy();

      expect(
        mocks.instances.flaskScanners[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.expressScanners[ 0 ].destroyed
      ).toBe(true);

      expect(
        mocks.instances.laravelScanners[ 0 ].destroyed
      ).toBe(true);
    });

    it("should destroy the shared filesystem after the scanner registry", async () => {
      await controller.init();

      const registry = mocks.instances.scannerRegistries[ 0 ];
      const fileSystem = mocks.instances.fileSystems[ 0 ];

      const originalRegistryDestroy = registry.destroy;
      const originalFileSystemDestroy = fileSystem.destroy;

      let registryDestroyed = false;

      registry.destroy = async function() {
        await originalRegistryDestroy.call(this);
        registryDestroyed = true;
      };

      fileSystem.destroy = function() {
        expect(registryDestroyed).toBe(true);
        originalFileSystemDestroy.call(this);
      };

      await controller.destroy();

      expect(registryDestroyed).toBe(true);
    });

    it("should clear component references", async () => {
      await controller.init();

      await controller.destroy();

      expect(controller.workspaceScanner).toBeNull();
      expect(controller.scannerRegistry).toBeNull();
      expect(controller.fileSystem).toBeNull();
      expect(controller.workspaceManager).toBeNull();
      expect(controller.acodeAdapter).toBeNull();
      expect(controller.routeRegistry).toBeNull();
      expect(controller.eventManager).toBeNull();
    });

    it("should be safe to destroy more than once", async () => {
      await controller.init();

      await controller.destroy();
      await controller.destroy();

      expect(controller.destroyed).toBe(true);
    });

    it("should reject operations after destruction", async () => {
      await controller.init();

      await controller.destroy();

      expect(() => controller.getRoutes()).toThrow(
        "RouteLensController is not initialized."
      );

      expect(() => controller.getWorkspace()).toThrow(
        "RouteLensController is not initialized."
      );
    });

    it("should remove event forwarding subscriptions", async () => {
      await controller.init();

      const registry = mocks.instances.routeRegistries[ 0 ];
      const workspaceManager = mocks.instances.workspaceManagers[ 0 ];

      expect(registry.listeners.size).toBeGreaterThan(0);
      expect(workspaceManager.listeners.size).toBeGreaterThan(0);

      await controller.destroy();

      expect(registry.listeners.size).toBe(0);
      expect(workspaceManager.listeners.size).toBe(0);
    });
  });
});
