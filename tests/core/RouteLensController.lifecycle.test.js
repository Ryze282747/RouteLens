import {
  describe,
  it,
  expect,
  vi,
  beforeEach
} from "vitest";

const mocks = vi.hoisted(() => ({
  workspaceInit: vi.fn(),
  workspaceInstances: [],
  fileSystemInstances: [],
  acodeInstances: []
}));

vi.mock("../../src/adapters/AcodeAdapter.js", () => ({
  default: class AcodeAdapter {
    constructor() {
      mocks.acodeInstances.push(this);
    }

    async getWorkspace() {
      return null;
    }

    destroy() {
      this.destroyed = true;
    }
  }
}));

vi.mock("../../src/adapters/FileSystemAdapter.js", () => ({
  default: class FileSystemAdapter {
    constructor() {
      mocks.fileSystemInstances.push(this);
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

vi.mock("../../src/core/WorkspaceManager.js", () => ({
  default: class WorkspaceManager {
    constructor(options) {
      this.options = options;
      mocks.workspaceInstances.push(this);
    }

    async init() {
      return mocks.workspaceInit();
    }

    getWorkspace() {
      return null;
    }

    subscribe() {
      return () => { };
    }

    destroy() {
      this.destroyed = true;
    }
  }
}));

import RouteLensController from "../../src/core/RouteLensController.js";

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("RouteLensController lifecycle races", () => {
  let controller;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceInstances = [];
    mocks.fileSystemInstances = [];
    mocks.acodeInstances = [];

    mocks.workspaceInit.mockReset();
    mocks.workspaceInit.mockResolvedValue(null);

    controller = new RouteLensController();
  });

  it("should clean up when destroyed during pending initialization", async () => {
    const deferred = createDeferred();

    mocks.workspaceInit.mockReturnValue(deferred.promise);

    const initPromise = controller.init();

    expect(controller.initPromise).not.toBeNull();
    expect(controller.workspaceManager).not.toBeNull();

    const destroyPromise = controller.destroy();

    expect(controller.destroyed).toBe(true);

    deferred.resolve(null);

    await expect(initPromise).rejects.toThrow(
      "RouteLensController has been destroyed."
    );

    await destroyPromise;

    expect(controller.initialized).toBe(false);
    expect(controller.destroyed).toBe(true);

    expect(controller.workspaceScanner).toBeNull();
    expect(controller.scannerRegistry).toBeNull();
    expect(controller.fileSystem).toBeNull();
    expect(controller.workspaceManager).toBeNull();
    expect(controller.acodeAdapter).toBeNull();
    expect(controller.routeRegistry).toBeNull();
    expect(controller.eventManager).toBeNull();

    expect(mocks.workspaceInstances[ 0 ].destroyed).toBe(true);
    expect(mocks.fileSystemInstances[ 0 ].destroyed).toBe(true);
    expect(mocks.acodeInstances[ 0 ].destroyed).toBe(true);
  });

  it("should allow multiple destroy calls during pending initialization", async () => {
    const deferred = createDeferred();

    mocks.workspaceInit.mockReturnValue(deferred.promise);

    const initPromise = controller.init();

    const firstDestroy = controller.destroy();
    const secondDestroy = controller.destroy();

    deferred.resolve(null);

    await expect(initPromise).rejects.toThrow(
      "RouteLensController has been destroyed."
    );

    await expect(firstDestroy).resolves.toBeUndefined();
    await expect(secondDestroy).resolves.toBeUndefined();

    expect(controller.destroyed).toBe(true);
    expect(controller.initialized).toBe(false);

    expect(controller.workspaceManager).toBeNull();
    expect(controller.scannerRegistry).toBeNull();
    expect(controller.fileSystem).toBeNull();

    expect(mocks.workspaceInstances[ 0 ].destroyed).toBe(true);
    expect(mocks.fileSystemInstances[ 0 ].destroyed).toBe(true);
  });

  it("should not initialize successfully after destruction begins", async () => {
    const deferred = createDeferred();

    mocks.workspaceInit.mockReturnValue(deferred.promise);

    const initPromise = controller.init();
    const destroyPromise = controller.destroy();

    deferred.resolve(null);

    await expect(initPromise).rejects.toThrow(
      "RouteLensController has been destroyed."
    );

    await destroyPromise;

    expect(controller.initialized).toBe(false);
  });

  it("should clean up when initialization fails while destruction is pending", async () => {
    const deferred = createDeferred();

    mocks.workspaceInit.mockReturnValue(deferred.promise);

    const initPromise = controller.init();
    const destroyPromise = controller.destroy();

    deferred.reject(new Error("Workspace initialization failed"));

    await expect(initPromise).rejects.toThrow(
      "Workspace initialization failed"
    );

    await destroyPromise;

    expect(controller.destroyed).toBe(true);
    expect(controller.workspaceManager).toBeNull();
    expect(controller.scannerRegistry).toBeNull();
    expect(controller.fileSystem).toBeNull();
  });
});
