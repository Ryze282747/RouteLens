import ScannerRegistry from "../scanners/ScannerRegistry.js";

export default class WorkspaceScanner {
  constructor({ registry, scannerRegistry = null } = {}) {
    if (!registry) {
      throw new Error("WorkspaceScanner requires a RouteRegistry.");
    }

    if (typeof registry.replaceAll !== "function") {
      throw new Error("RouteRegistry must implement replaceAll().");
    }

    this.routeRegistry = registry;

    this.ownsScannerRegistry = scannerRegistry === null;

    this.scannerRegistry = this.ownsScannerRegistry
      ? new ScannerRegistry()
      : scannerRegistry;

    this.scanning = false;
    this.destroyed = false;
    this.lastResult = null;
    this.scanToken = 0;
  }

  async scan(workspace, options = {}) {
    this.ensureActive();

    if (this.scanning) {
      throw new Error("A workspace scan is already in progress.");
    }

    if (!workspace || typeof workspace !== "object") {
      throw new TypeError("A valid workspace is required.");
    }

    if (
      typeof workspace.root !== "string" ||
      !workspace.root.trim()
    ) {
      throw new Error("Workspace must contain a valid root path.");
    }

    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options)
    ) {
      throw new TypeError("Scan options must be an object.");
    }

    if (
      !this.scannerRegistry ||
      typeof this.scannerRegistry.detect !== "function"
    ) {
      throw new Error("ScannerRegistry must implement detect().");
    }

    this.scanning = true;

    const token = ++this.scanToken;

    try {
      const detectedScanners = await this.scannerRegistry.detect(
        workspace,
        options
      );

      this.ensureScanActive(token);

      if (!Array.isArray(detectedScanners)) {
        throw new TypeError(
          "ScannerRegistry.detect() must return an array."
        );
      }

      const results = [];
      const successfulFrameworks = new Set();
      const failedFrameworks = new Set();
      const scannerResults = [];

      for (const scanner of detectedScanners) {
        this.ensureScanActive(token);

        if (
          !scanner ||
          typeof scanner.scan !== "function" ||
          typeof scanner.framework !== "string" ||
          !scanner.framework.trim()
        ) {
          scannerResults.push({
            scanner: scanner?.id || "unknown",
            framework: scanner?.framework || null,
            status: "invalid",
            routeCount: 0,
            error: "Invalid scanner entry."
          });

          console.error(
            "[RouteLens] Ignoring an invalid scanner entry."
          );

          continue;
        }

        try {
          const result = await scanner.scan(workspace, options);

          this.ensureScanActive(token);

          if (!Array.isArray(result)) {
            throw new TypeError(
              `Scanner "${scanner.id || "unknown"}" must return an array.`
            );
          }

          results.push(...result);
          successfulFrameworks.add(scanner.framework);

          scannerResults.push({
            scanner: scanner.id || "unknown",
            framework: scanner.framework,
            status: "success",
            routeCount: result.length,
            error: null
          });
        } catch (error) {
          this.ensureScanActive(token);

          failedFrameworks.add(scanner.framework);

          scannerResults.push({
            scanner: scanner.id || "unknown",
            framework: scanner.framework,
            status: "failed",
            routeCount: 0,
            error: error?.message || String(error)
          });

          console.error(
            `[RouteLens] Scanner failed (${scanner.id || "unknown"}):`,
            error
          );
        }
      }

      this.ensureScanActive(token);

      // Preserve previous routes for frameworks that failed to scan.
      // This capability is optional for injected registry implementations.
      let preservedRoutes = [];

      if (
        failedFrameworks.size > 0 &&
        this.routeRegistry &&
        typeof this.routeRegistry.getAll === "function"
      ) {
        const previousRoutes = this.routeRegistry.getAll();

        if (Array.isArray(previousRoutes)) {
          preservedRoutes = previousRoutes.filter((route) => {
            return (
              route &&
              failedFrameworks.has(route.framework) &&
              !successfulFrameworks.has(route.framework)
            );
          });
        }
      }

      const combinedRoutes = [
        ...results,
        ...preservedRoutes
      ];

      this.ensureScanActive(token);

      const routes = this.routeRegistry.replaceAll(combinedRoutes);

      const scanResult = {
        workspace: workspace.root,
        scannerCount: detectedScanners.length,
        successfulScannerCount: scannerResults.filter(
          (result) => result.status === "success"
        ).length,
        failedScannerCount: scannerResults.filter(
          (result) => result.status === "failed"
        ).length,
        routeCount: routes.length,
        preservedRouteCount: preservedRoutes.length,
        routes,
        scanners: scannerResults,
        scannedAt: Date.now()
      };

      this.ensureScanActive(token);

      this.lastResult = scanResult;

      return scanResult;
    } finally {
      if (this.scanToken === token) {
        this.scanning = false;
      }
    }
  }

  getLastResult() {
    this.ensureActive();
    return this.lastResult;
  }

  isScanning() {
    return this.scanning;
  }

  ensureScanActive(token) {
    this.ensureActive();

    if (token !== this.scanToken) {
      throw new Error("Workspace scan was cancelled.");
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("WorkspaceScanner has been destroyed.");
    }
  }

  async destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.scanToken++;
    this.scanning = false;
    this.lastResult = null;

    if (
      this.ownsScannerRegistry &&
      this.scannerRegistry &&
      typeof this.scannerRegistry.destroy === "function"
    ) {
      try {
        await this.scannerRegistry.destroy();
      } catch (error) {
        console.error(
          "[RouteLens] Scanner registry cleanup failed:",
          error
        );
      }
    }

    this.scannerRegistry = null;
    this.routeRegistry = null;
    this.ownsScannerRegistry = false;
  }
}
