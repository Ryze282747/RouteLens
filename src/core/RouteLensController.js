import WorkspaceScanner from "./WorkspaceScanner.js";
import RouteRegistry from "./RouteRegistry.js";
import WorkspaceManager from "./WorkspaceManager.js";
import EventManager from "./EventManager.js";

import AcodeAdapter from "../adapters/AcodeAdapter.js";
import FileSystemAdapter from "../adapters/FileSystemAdapter.js";
import AcodeWorkspaceWatcherAdapter from "../adapters/watcher/AcodeWorkspaceWatcherAdapter.js";

import ScannerRegistry from "../scanners/ScannerRegistry.js";

import FlaskScanner from "../scanners/flask/FlaskScanner.js";
import ExpressScanner from "../scanners/express/ExpressScanner.js";
import LaravelScanner from "../scanners/laravel/LaravelScanner.js";
import FastAPIScanner from "../scanners/fastapi/FastAPIScanner.js";
import DjangoScanner from "../scanners/django/DjangoScanner.js";
import NestJSScanner from "../scanners/nestjs/NestJSScanner.js";

export default class RouteLensController {
  constructor() {
    this.workspaceManager = null;
    this.workspaceScanner = null;
    this.routeRegistry = null;
    this.eventManager = null;

    this.acodeAdapter = null;
    this.fileSystem = null;
    this.workspaceWatcher = null;
    this.scannerRegistry = null;

    this.subscriptions = [];

    this.initialized = false;
    this.destroyed = false;

    this.initPromise = null;
    this.destroyPromise = null;
    this.cleanupPromise = null;

    this.workspaceWatchPromise = Promise.resolve();

    this.autoRescanTimeout = null;
    this.autoRescanDelay = 500;
    this.pendingAutoRescanEvent = null;
  }

  async init() {
    if (this.destroyed) {
      throw new Error(
        "Cannot initialize a destroyed RouteLensController."
      );
    }

    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initialize();

    return this.initPromise;
  }

  async initialize() {
    try {
      this.eventManager = new EventManager();
      this.routeRegistry = new RouteRegistry();

      this.acodeAdapter = new AcodeAdapter();
      this.fileSystem = new FileSystemAdapter();

      this.workspaceWatcher =
        new AcodeWorkspaceWatcherAdapter({
          fileSystem: this.fileSystem,
          pollInterval: 500
        });

      this.scannerRegistry = new ScannerRegistry();

      this.registerScanners();

      this.workspaceManager = new WorkspaceManager({
        acodeAdapter: this.acodeAdapter
      });

      this.workspaceScanner = new WorkspaceScanner({
        registry: this.routeRegistry,
        scannerRegistry: this.scannerRegistry
      });

      this.connectEvents();

      this.ensureNotDestroyed();

      await this.workspaceManager.init();

      this.ensureNotDestroyed();

      this.initialized = true;

      await this.queueWorkspaceWatcherUpdate(
        this.workspaceManager.getWorkspace()
      );

      this.ensureInitialized();

      this.eventManager.emit("controller:initialized", {
        workspace: this.workspaceManager.getWorkspace()
      });

      console.log("[RouteLens] Controller initialized.");
    } catch (error) {
      this.initialized = false;

      await this.cleanupComponents();

      throw error;
    }
  }

  registerScanners() {
    this.ensureNotDestroyed();

    if (!this.scannerRegistry || !this.fileSystem) {
      throw new Error(
        "Scanner infrastructure has not been initialized."
      );
    }

    this.scannerRegistry.register(
      new FlaskScanner({
        fileSystem: this.fileSystem
      })
    );

    this.scannerRegistry.register(
      new ExpressScanner({
        fileSystem: this.fileSystem
      })
    );

    this.scannerRegistry.register(
      new LaravelScanner({
        fileSystem: this.fileSystem
      })
    );

    this.scannerRegistry.register(
      new FastAPIScanner({
        fileSystem: this.fileSystem
      })
    );

    this.scannerRegistry.register(
      new DjangoScanner({
        fileSystem: this.fileSystem
      })
    );

    this.scannerRegistry.register(
      new NestJSScanner({
        fileSystem: this.fileSystem
      })
    );
  }

  connectEvents() {
    this.ensureNotDestroyed();

    if (!this.eventManager || !this.routeRegistry) {
      throw new Error(
        "Event infrastructure has not been initialized."
      );
    }

    const routeEvents = [
      "route:added",
      "route:updated",
      "route:removed",
      "routes:replaced",
      "routes:cleared"
    ];

    for (const event of routeEvents) {
      const unsubscribe = this.routeRegistry.subscribe(
        event,
        (data) => {
          if (!this.destroyed && this.eventManager) {
            this.eventManager.emit(event, data);
          }
        }
      );

      this.subscriptions.push(unsubscribe);
    }

    const unsubscribeWorkspace =
      this.workspaceManager.subscribe((event) => {
        if (this.destroyed || !this.eventManager) {
          return;
        }

        this.eventManager.emit(
          "workspace:changed",
          event
        );

        if (this.initialized) {
          this.queueWorkspaceWatcherUpdate(
            event.workspace
          );
        }
      });

    this.subscriptions.push(unsubscribeWorkspace);

    this.connectWatcherEvents();
  }

  connectWatcherEvents() {
    if (!this.workspaceWatcher) {
      throw new Error(
        "Workspace watcher has not been initialized."
      );
    }

    const watcherEvents = [
      "started",
      "stopped",
      "change",
      "error"
    ];

    for (const event of watcherEvents) {
      const unsubscribe =
        this.workspaceWatcher.subscribe(
          event,
          (data) => {
            if (
              this.destroyed ||
              !this.eventManager
            ) {
              return;
            }

            if (event === "started") {
              this.eventManager.emit(
                "watcher:started",
                data
              );
            }

            if (event === "stopped") {
              this.eventManager.emit(
                "watcher:stopped",
                data
              );
            }

            if (event === "change") {
              this.eventManager.emit(
                "watcher:changed",
                data
              );

              this.scheduleAutomaticRescan(data);
            }

            if (event === "error") {
              this.eventManager.emit(
                "watcher:error",
                data
              );
            }
          }
        );

      this.subscriptions.push(unsubscribe);
    }
  }

  queueWorkspaceWatcherUpdate(workspace) {
    if (this.destroyed || !this.workspaceWatcher) {
      return Promise.resolve();
    }

    const update = async () => {
      if (this.destroyed || !this.workspaceWatcher) {
        return;
      }

      if (!workspace) {
        if (this.workspaceWatcher.workspace) {
          await this.workspaceWatcher.stop();
        }

        this.clearAutomaticRescan();

        return;
      }

      const currentWorkspace =
        this.workspaceWatcher.workspace;

      if (
        currentWorkspace &&
        currentWorkspace.root === workspace.root &&
        currentWorkspace.uri === workspace.uri
      ) {
        return;
      }

      this.clearAutomaticRescan();

      const result =
        await this.workspaceWatcher.start(workspace);

      if (this.destroyed || !this.eventManager) {
        return;
      }

      console.log(
        "[RouteLens] Workspace monitoring started:",
        {
          root: workspace.root,
          fileCount: result.fileCount
        }
      );
    };

    const operation = this.workspaceWatchPromise.then(
      update
    );

    this.workspaceWatchPromise = operation.catch(
      (error) => {
        if (!this.destroyed && this.eventManager) {
          console.error(
            "[RouteLens] Unable to update workspace watcher:",
            error
          );

          this.eventManager.emit("watcher:error", {
            workspace,
            error
          });
        }
      }
    );

    return this.workspaceWatchPromise;
  }

  scheduleAutomaticRescan(event) {
    if (
      this.destroyed ||
      !this.initialized ||
      !this.workspaceScanner
    ) {
      return;
    }

    this.pendingAutoRescanEvent = event;

    if (this.autoRescanTimeout !== null) {
      clearTimeout(this.autoRescanTimeout);
    }

    this.autoRescanTimeout = setTimeout(() => {
      this.autoRescanTimeout = null;

      this.runAutomaticRescan().catch((error) => {
        if (!this.destroyed) {
          console.error(
            "[RouteLens] Automatic rescan failed:",
            error
          );
        }
      });
    }, this.autoRescanDelay);
  }

  async runAutomaticRescan() {
    this.ensureInitialized();

    if (!this.workspaceScanner) {
      return null;
    }

    if (!this.workspaceManager.hasWorkspace()) {
      this.pendingAutoRescanEvent = null;
      return null;
    }

    // Do not overlap an existing manual or automatic scan.
    // Retry after it finishes.
    if (this.workspaceScanner.isScanning()) {
      this.autoRescanTimeout = setTimeout(() => {
        this.autoRescanTimeout = null;

        this.runAutomaticRescan().catch((error) => {
          if (!this.destroyed) {
            console.error(
              "[RouteLens] Automatic rescan retry failed:",
              error
            );
          }
        });
      }, 250);

      return null;
    }

    const changeEvent = this.pendingAutoRescanEvent;

    this.pendingAutoRescanEvent = null;

    console.log(
      "[RouteLens] File changes detected. Rescanning workspace."
    );

    return this.scanWorkspace({
      automatic: true,
      trigger: "file-change",
      changes: changeEvent?.changes || null
    });
  }

  clearAutomaticRescan() {
    if (this.autoRescanTimeout !== null) {
      clearTimeout(this.autoRescanTimeout);
      this.autoRescanTimeout = null;
    }

    this.pendingAutoRescanEvent = null;
  }

  async refreshWorkspace() {
    this.ensureInitialized();

    const workspace =
      await this.workspaceManager.refresh();

    await this.workspaceWatchPromise;

    return workspace;
  }

  setWorkspace(workspace) {
    this.ensureInitialized();

    if (!workspace || typeof workspace !== "object") {
      throw new TypeError(
        "A valid workspace object is required."
      );
    }

    if (
      typeof workspace.root !== "string" ||
      !workspace.root.trim()
    ) {
      throw new Error(
        "Selected workspace must contain a valid root URL."
      );
    }

    const normalizedWorkspace =
      this.workspaceManager.normalizeWorkspace(workspace);

    if (!normalizedWorkspace) {
      throw new Error(
        "Unable to normalize the selected workspace."
      );
    }

    const selectedWorkspace =
      this.workspaceManager.setWorkspace(
        normalizedWorkspace
      );

    console.log(
      "[RouteLens] Workspace selected:",
      {
        name: selectedWorkspace.name,
        root: selectedWorkspace.root,
        source: selectedWorkspace.source
      }
    );

    return selectedWorkspace;
  }

  async scanWorkspace(options = {}) {
    this.ensureInitialized();

    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options)
    ) {
      throw new TypeError(
        "Scan options must be an object."
      );
    }

    const workspace =
      this.workspaceManager.getWorkspace();

    if (!workspace) {
      throw new Error(
        "No workspace is currently available."
      );
    }

    this.eventManager.emit("scan:started", {
      workspace,
      options
    });

    try {
      const result = await this.workspaceScanner.scan(
        workspace,
        options
      );

      this.ensureInitialized();

      this.eventManager.emit(
        "scan:completed",
        result
      );

      return result;
    } catch (error) {
      if (!this.destroyed && this.eventManager) {
        this.eventManager.emit("scan:failed", {
          workspace,
          error
        });
      }

      throw error;
    }
  }

  getRoutes() {
    this.ensureInitialized();

    return this.routeRegistry.getAll();
  }

  getRoute(id) {
    this.ensureInitialized();

    return this.routeRegistry.get(id);
  }

  getWorkspace() {
    this.ensureInitialized();

    return this.workspaceManager.getWorkspace();
  }

  getScannerRegistry() {
    this.ensureInitialized();

    return this.scannerRegistry;
  }

  on(event, callback) {
    this.ensureInitialized();

    return this.eventManager.on(event, callback);
  }

  once(event, callback) {
    this.ensureInitialized();

    return this.eventManager.once(event, callback);
  }

  ensureInitialized() {
    if (!this.initialized || this.destroyed) {
      throw new Error(
        "RouteLensController is not initialized."
      );
    }
  }

  ensureNotDestroyed() {
    if (this.destroyed) {
      throw new Error(
        "RouteLensController has been destroyed."
      );
    }
  }

  async cleanupComponents() {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }

    this.cleanupPromise = (async () => {
      this.clearAutomaticRescan();

      for (const unsubscribe of this.subscriptions) {
        try {
          unsubscribe();
        } catch (error) {
          console.error(
            "[RouteLens] Subscription cleanup failed:",
            error
          );
        }
      }

      this.subscriptions = [];

      try {
        await this.workspaceWatchPromise;
      } catch {
        // Watcher startup failures are handled separately.
      }

      await this.destroyComponent(
        this.workspaceWatcher,
        "AcodeWorkspaceWatcherAdapter"
      );

      await this.destroyComponent(
        this.workspaceScanner,
        "WorkspaceScanner"
      );

      await this.destroyComponent(
        this.scannerRegistry,
        "ScannerRegistry"
      );

      await this.destroyComponent(
        this.fileSystem,
        "FileSystemAdapter"
      );

      await this.destroyComponent(
        this.workspaceManager,
        "WorkspaceManager"
      );

      await this.destroyComponent(
        this.acodeAdapter,
        "AcodeAdapter"
      );

      await this.destroyComponent(
        this.routeRegistry,
        "RouteRegistry"
      );

      await this.destroyComponent(
        this.eventManager,
        "EventManager"
      );

      this.workspaceWatcher = null;
      this.workspaceScanner = null;
      this.scannerRegistry = null;
      this.fileSystem = null;

      this.workspaceManager = null;
      this.acodeAdapter = null;

      this.routeRegistry = null;
      this.eventManager = null;

      this.workspaceWatchPromise = Promise.resolve();

      this.initialized = false;
    })();

    return this.cleanupPromise;
  }

  async destroyComponent(component, name) {
    if (
      !component ||
      typeof component.destroy !== "function"
    ) {
      return;
    }

    try {
      await component.destroy();
    } catch (error) {
      console.error(
        `[RouteLens] ${name} cleanup failed:`,
        error
      );
    }
  }

  async destroy() {
    if (this.destroyPromise) {
      return this.destroyPromise;
    }

    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.initialized = false;

    this.destroyPromise = (async () => {
      if (this.initPromise) {
        try {
          await this.initPromise;
        } catch {
          // Initialization failure is handled by initialize().
        }
      }

      await this.cleanupComponents();

      console.log("[RouteLens] Controller destroyed.");
    })();

    return this.destroyPromise;
  }
}
