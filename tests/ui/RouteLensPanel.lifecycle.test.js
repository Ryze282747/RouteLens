import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteLensPanel from "../../src/ui/RouteLensPanel.js";

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject
  };
}

function createRoute(id, path) {
  return {
    id,
    path,
    methods: [ "GET" ],
    framework: "express",
    handler: `handler${id}`,
    file: `src/routes/${id}.js`,
    line: 10
  };
}

function createPanel(controller = {}) {
  const status = {
    textContent: "Ready to scan."
  };

  const routeCount = {
    textContent: "0 routes"
  };

  const routeList = {
    setRoutes: vi.fn(),
    setSelected: vi.fn(),
    destroy: vi.fn()
  };

  const routeDetails = {
    setRoute: vi.fn(),
    destroy: vi.fn()
  };

  const routeSearch = {
    getValue: vi.fn().mockReturnValue(""),
    destroy: vi.fn()
  };

  const routeFilters = {
    getValue: vi.fn().mockReturnValue({
      method: "all",
      framework: "all"
    }),
    destroy: vi.fn()
  };

  const routeStatistics = {
    setData: vi.fn(),
    destroy: vi.fn()
  };

  const element = {
    querySelector: vi.fn((selector) => {
      if (selector === '[data-region="status"]') {
        return status;
      }

      if (selector === '[data-region="route-count"]') {
        return routeCount;
      }

      return null;
    }),

    removeEventListener: vi.fn(),
    remove: vi.fn()
  };

  const panel = new RouteLensPanel({
    controller
  });

  panel.element = element;
  panel.routeList = routeList;
  panel.routeDetails = routeDetails;
  panel.routeSearch = routeSearch;
  panel.routeFilters = routeFilters;
  panel.routeStatistics = routeStatistics;

  return {
    panel,
    status,
    routeCount,
    routeList,
    routeDetails,
    routeSearch,
    routeFilters,
    routeStatistics,
    element
  };
}

describe("RouteLensPanel asynchronous lifecycle", () => {
  describe("concurrent scans", () => {
    it("keeps the results from the latest completed scan", async () => {
      const firstScan = createDeferred();
      const secondScan = createDeferred();

      const controller = {
        scanWorkspace: vi.fn()
          .mockReturnValueOnce(firstScan.promise)
          .mockReturnValueOnce(secondScan.promise)
      };

      const {
        panel,
        status
      } = createPanel(controller);

      const firstRequest = panel.scan();
      const secondRequest = panel.scan();

      const latestRoute = createRoute(
        "latest",
        "/latest"
      );

      secondScan.resolve({
        routes: [ latestRoute ]
      });

      await secondRequest;

      expect(panel.routes).toEqual([ latestRoute ]);
      expect(status.textContent).toBe(
        "Scan complete. Found 1 routes."
      );

      const outdatedRoute = createRoute(
        "outdated",
        "/outdated"
      );

      firstScan.resolve({
        routes: [ outdatedRoute ]
      });

      await firstRequest;

      expect(panel.routes).toEqual([ latestRoute ]);
      expect(panel.filteredRoutes).toEqual([ latestRoute ]);
      expect(status.textContent).toBe(
        "Scan complete. Found 1 routes."
      );
    });

    it("does not let an older failed scan overwrite a newer success", async () => {
      const firstScan = createDeferred();
      const secondScan = createDeferred();

      const controller = {
        scanWorkspace: vi.fn()
          .mockReturnValueOnce(firstScan.promise)
          .mockReturnValueOnce(secondScan.promise)
      };

      const {
        panel,
        status
      } = createPanel(controller);

      const firstRequest = panel.scan();
      const secondRequest = panel.scan();

      const route = createRoute(
        "current",
        "/current"
      );

      secondScan.resolve({
        routes: [ route ]
      });

      await secondRequest;

      firstScan.reject(
        new Error("Outdated scan failed")
      );

      await firstRequest;

      expect(panel.routes).toEqual([ route ]);
      expect(status.textContent).toBe(
        "Scan complete. Found 1 routes."
      );
    });
  });

  describe("scan destruction safety", () => {
    it("does not update panel state after destruction during scanning", async () => {
      const pendingScan = createDeferred();

      const controller = {
        scanWorkspace: vi.fn()
          .mockReturnValue(pendingScan.promise)
      };

      const {
        panel,
        status,
        routeList,
        routeStatistics
      } = createPanel(controller);

      const request = panel.scan();

      expect(status.textContent).toBe(
        "Scanning project..."
      );

      panel.destroy();

      const route = createRoute(
        "late",
        "/late"
      );

      pendingScan.resolve({
        routes: [ route ]
      });

      await request;

      expect(panel.destroyed).toBe(true);
      expect(panel.routes).toEqual([]);
      expect(panel.filteredRoutes).toEqual([]);
      expect(panel.analysis).toBeNull();

      expect(routeList.setRoutes).not.toHaveBeenCalled();
      expect(routeStatistics.setData).not.toHaveBeenCalled();
    });
  });

  describe("concurrent navigation", () => {
    it("keeps the status from the latest navigation request", async () => {
      const firstNavigation = createDeferred();
      const secondNavigation = createDeferred();

      const navigator = {
        navigate: vi.fn()
          .mockReturnValueOnce(firstNavigation.promise)
          .mockReturnValueOnce(secondNavigation.promise)
      };

      const {
        panel,
        status
      } = createPanel();

      panel.navigator = navigator;

      const firstRoute = createRoute(
        "first",
        "/first"
      );

      const secondRoute = createRoute(
        "second",
        "/second"
      );

      const firstRequest = panel.navigateToRoute(firstRoute);
      const secondRequest = panel.navigateToRoute(secondRoute);

      secondNavigation.resolve({
        file: "src/routes/second.js",
        line: 20
      });

      await secondRequest;

      expect(status.textContent).toBe(
        "Opened src/routes/second.js at line 20."
      );

      firstNavigation.resolve({
        file: "src/routes/first.js",
        line: 10
      });

      await firstRequest;

      expect(status.textContent).toBe(
        "Opened src/routes/second.js at line 20."
      );
    });
  });

  describe("navigation destruction safety", () => {
    it("does not update panel state after destruction during navigation", async () => {
      const pendingNavigation = createDeferred();

      const navigator = {
        navigate: vi.fn()
          .mockReturnValue(pendingNavigation.promise)
      };

      const {
        panel,
        status
      } = createPanel();

      panel.navigator = navigator;

      status.textContent = "Existing status";

      const route = createRoute(
        "late",
        "/late"
      );

      const request = panel.navigateToRoute(route);

      panel.destroy();

      const navigationResult = {
        file: "src/routes/late.js",
        line: 15
      };

      pendingNavigation.resolve(navigationResult);

      const result = await request;

      expect(result).toBe(navigationResult);
      expect(panel.destroyed).toBe(true);
      expect(status.textContent).toBe("Existing status");
    });
  });
});
