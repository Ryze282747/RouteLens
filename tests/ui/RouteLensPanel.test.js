
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteLensPanel from "../../src/ui/RouteLensPanel.js";

class MockClassList {
  constructor(element) {
    this.element = element;
  }

  get values() {
    return new Set(
      String(this.element.className || "")
        .split(/\s+/)
        .filter(Boolean)
    );
  }

  add(...names) {
    const values = this.values;

    for (const name of names) {
      values.add(name);
    }

    this.element.className = [ ...values ].join(" ");
  }

  remove(...names) {
    const values = this.values;

    for (const name of names) {
      values.delete(name);
    }

    this.element.className = [ ...values ].join(" ");
  }

  contains(name) {
    return this.values.has(name);
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.classList = new MockClassList(this);
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.value = "";
    this.type = "";
    this.placeholder = "";
    this._textContent = "";
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.replaceChildren();

    const pattern = /<([a-z][\w-]*)\b([^>]*)>/gi;
    let match;

    while ((match = pattern.exec(this._innerHTML))) {
      const [ , tagName, attributes ] = match;

      const region = attributes.match(
        /data-region=["']([^"']+)["']/
      );

      const action = attributes.match(
        /data-action=["']([^"']+)["']/
      );

      if (!region && !action) {
        continue;
      }

      const element = new MockElement(tagName);

      if (region) {
        element.dataset.region = region[ 1 ];
      }

      if (action) {
        element.dataset.action = action[ 1 ];
      }

      const openingTagEnd =
        this._innerHTML.indexOf(">", match.index) + 1;

      const remaining = this._innerHTML.slice(openingTagEnd);

      const closingPattern = new RegExp(
        `</${tagName}\\s*>`,
        "i"
      );

      const closingMatch = closingPattern.exec(remaining);

      if (closingMatch) {
        element._textContent = remaining
          .slice(0, closingMatch.index)
          .replace(/<[^>]*>/g, "")
          .trim();
      }

      this.appendChild(element);
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set textContent(value) {
    // Detach existing children.
    for (const child of this.children) {
      child.parentElement = null;
    }

    // Clear children without resetting the assigned text.
    this.children = [];

    // Assign text after clearing the children.
    this._textContent = String(value);
  }

  get textContent() {
    if (this.children.length === 0) {
      return this._textContent;
    }

    return this.children
      .map((child) => child.textContent)
      .join("");
  }

  appendChild(child) {
    if (child.parentElement) {
      child.remove();
    }

    child.parentElement = this;
    this.children.push(child);

    return child;
  }

  append(...elements) {
    for (const element of elements) {
      this.appendChild(element);
    }
  }

  replaceChildren(...elements) {
    for (const child of this.children) {
      child.parentElement = null;
    }

    this.children = [];
    this._textContent = "";

    for (const element of elements) {
      this.appendChild(element);
    }
  }

  remove() {
    if (!this.parentElement) {
      return;
    }

    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);

    if (index !== -1) {
      siblings.splice(index, 1);
    }

    this.parentElement = null;
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  dispatchEvent(event) {
    event.target ||= this;

    const callbacks = this.listeners.get(event.type);

    if (callbacks) {
      for (const callback of [ ...callbacks ]) {
        callback.call(this, event);
      }
    }

    if (event.bubbles && !event.propagationStopped) {
      this.parentElement?.dispatchEvent(event);
    }

    return !event.defaultPrevented;
  }

  contains(element) {
    if (this === element) {
      return true;
    }

    return this.children.some(
      (child) => child.contains(element)
    );
  }

  matches(selector) {
    if (selector.startsWith(".")) {
      return this.classList.contains(selector.slice(1));
    }

    const dataMatch = selector.match(
      /^\[data-([\w-]+)=["']([^"']+)["']\]$/
    );

    if (dataMatch) {
      const [ , key, value ] = dataMatch;

      const datasetKey = key.replace(
        /-([a-z])/g,
        (_, character) => character.toUpperCase()
      );

      return this.dataset[ datasetKey ] === value;
    }

    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  closest(selector) {
    let current = this;

    while (current) {
      if (current.matches(selector)) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[ 0 ] || null;
  }

  querySelectorAll(selector) {
    const results = [];

    const visit = (element) => {
      for (const child of element.children) {
        if (child.matches(selector)) {
          results.push(child);
        }

        visit(child);
      }
    };

    visit(this);

    return results;
  }

  setAttribute(name, value) {
    this.attributes[ name ] = String(value);
  }

  getAttribute(name) {
    return this.attributes[ name ] ?? null;
  }

  focus() {
    this.focused = true;
  }
}

function createMockDocument() {
  return {
    createElement(tagName) {
      return new MockElement(tagName);
    }
  };
}

function createRoute(overrides = {}) {
  return {
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    framework: "express",
    handler: "getUsers",
    controller: "UserController",
    file: "src/routes/users.js",
    line: 12,
    metadata: {},
    ...overrides
  };
}

function createController(overrides = {}) {
  return {
    scanWorkspace: vi.fn().mockResolvedValue({
      routes: [
        createRoute(),

        createRoute({
          id: "route-2",
          path: "/users/:id",
          methods: [ "GET", "DELETE" ],
          handler: "getUser",
          controller: "UserDetailController",
          file: "src/routes/user.js",
          framework: "express"
        }),

        createRoute({
          id: "route-3",
          path: "/products",
          methods: [ "POST" ],
          handler: "createProduct",
          controller: "ProductController",
          file: "src/routes/products.js",
          framework: "flask"
        })
      ]
    }),
    ...overrides
  };
}

function createContainer() {
  return new MockElement("div");
}

function click(element) {
  element.dispatchEvent({
    type: "click",
    bubbles: true,
    propagationStopped: false,
    stopPropagation() {
      this.propagationStopped = true;
    }
  });
}

describe("RouteLensPanel", () => {
  let originalDocument;
  let container;
  let controller;
  let panel;

  beforeEach(() => {
    originalDocument = globalThis.document;

    vi.stubGlobal("document", createMockDocument());

    container = createContainer();
    controller = createController();

    panel = new RouteLensPanel({
      controller
    });
  });

  afterEach(() => {
    panel?.destroy();

    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    if (originalDocument) {
      vi.stubGlobal("document", originalDocument);
    }
  });

  describe("constructor", () => {
    it("creates a panel with default state", () => {
      expect(panel.controller).toBe(controller);
      expect(panel.analyzer).toBeNull();
      expect(panel.navigator).toBeNull();
      expect(panel.exportManager).toBeNull();

      expect(panel.element).toBeNull();
      expect(panel.container).toBeNull();

      expect(panel.routes).toEqual([]);
      expect(panel.filteredRoutes).toEqual([]);
      expect(panel.analysis).toBeNull();
      expect(panel.selectedRoute).toBeNull();

      expect(panel.destroyed).toBe(false);
    });

    it("accepts optional dependencies", () => {
      const analyzer = {
        analyze: vi.fn()
      };

      const navigator = {
        navigate: vi.fn()
      };

      const exportManager = {};

      const instance = new RouteLensPanel({
        controller,
        analyzer,
        navigator,
        exportManager
      });

      expect(instance.analyzer).toBe(analyzer);
      expect(instance.navigator).toBe(navigator);
      expect(instance.exportManager).toBe(exportManager);

      instance.destroy();
    });

    it("requires a controller", () => {
      expect(() => new RouteLensPanel()).toThrow(
        "RouteLensPanel requires a RouteLensController."
      );
    });
  });

  describe("initialization", () => {
    it("requires a valid DOM container", async () => {
      await expect(panel.init(null)).rejects.toThrow(
        "A valid DOM container is required."
      );

      await expect(panel.init({})).rejects.toThrow(
        "A valid DOM container is required."
      );
    });

    it("creates and mounts the panel", async () => {
      const element = await panel.init(container);

      expect(element).toBeInstanceOf(MockElement);
      expect(element.className).toBe("routelens-panel");
      expect(container.children).toContain(element);
    });

    it("creates all five UI components", async () => {
      await panel.init(container);

      expect(panel.routeList).not.toBeNull();
      expect(panel.routeDetails).not.toBeNull();
      expect(panel.routeFilters).not.toBeNull();
      expect(panel.routeSearch).not.toBeNull();
      expect(panel.routeStatistics).not.toBeNull();
    });

    it("mounts every component into its designated region", async () => {
      await panel.init(container);

      const regions = [
        "statistics",
        "search",
        "filters",
        "route-list",
        "route-details"
      ];

      for (const name of regions) {
        const region = panel.element.querySelector(
          `[data-region="${name}"]`
        );

        expect(region).not.toBeNull();
        expect(region.children.length).toBe(1);
      }
    });

    it("returns the existing element on repeated initialization", async () => {
      const first = await panel.init(container);
      const second = await panel.init(container);

      expect(second).toBe(first);
      expect(container.children).toHaveLength(1);
    });

    it("renders the initial empty state", async () => {
      await panel.init(container);

      expect(panel.filteredRoutes).toEqual([]);
      expect(panel.routeList.getRoutes()).toEqual([]);
      expect(panel.routeDetails.route).toBeNull();
    });

    it("rejects initialization after destruction", async () => {
      panel.destroy();

      await expect(panel.init(container)).rejects.toThrow(
        "RouteLensPanel has been destroyed."
      );
    });
  });

  describe("scanning", () => {
    it("scans the workspace and stores discovered routes", async () => {
      await panel.init(container);

      const result = await panel.scan();

      expect(controller.scanWorkspace).toHaveBeenCalledOnce();
      expect(result.routes).toHaveLength(3);
      expect(panel.routes).toHaveLength(3);
      expect(panel.filteredRoutes).toHaveLength(3);
    });

    it("calculates analysis when an analyzer is provided", async () => {
      const analysis = {
        totalRoutes: 3,
        score: 90
      };

      const analyzer = {
        analyze: vi.fn().mockReturnValue(analysis)
      };

      panel = new RouteLensPanel({
        controller,
        analyzer
      });

      await panel.init(container);
      await panel.scan();

      expect(analyzer.analyze).toHaveBeenCalledWith(
        panel.routes
      );

      expect(panel.analysis).toBe(analysis);
    });

    it("keeps analysis null without an analyzer", async () => {
      await panel.init(container);
      await panel.scan();

      expect(panel.analysis).toBeNull();
    });

    it("handles a scan result without a routes array", async () => {
      controller.scanWorkspace.mockResolvedValue({
        routes: null
      });

      await panel.init(container);
      await panel.scan();

      expect(panel.routes).toEqual([]);
      expect(panel.filteredRoutes).toEqual([]);
    });

    it("updates the scan status after success", async () => {
      await panel.init(container);
      await panel.scan();

      expect(
        panel.element.querySelector('[data-region="status"]').textContent
      ).toBe("Scan complete. Found 3 routes.");
    });

    it("handles scan errors", async () => {
      const error = new Error("Workspace unavailable");

      controller.scanWorkspace.mockRejectedValue(error);

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      await panel.init(container);

      const result = await panel.scan();

      expect(result).toBeNull();

      expect(
        panel.element.querySelector('[data-region="status"]').textContent
      ).toBe("Workspace unavailable");

      expect(consoleError).toHaveBeenCalled();
    });

    it("starts scanning when the scan button is clicked", async () => {
      await panel.init(container);

      const scanButton = panel.element.querySelector(
        '[data-action="scan"]'
      );

      expect(scanButton).not.toBeNull();

      click(scanButton);

      await vi.waitFor(() => {
        expect(controller.scanWorkspace).toHaveBeenCalledOnce();
      });
    });

    it("rejects scanning after destruction", async () => {
      panel.destroy();

      await expect(panel.scan()).rejects.toThrow(
        "RouteLensPanel has been destroyed."
      );

      expect(controller.scanWorkspace).not.toHaveBeenCalled();
    });
  });

  describe("search and filtering", () => {
    beforeEach(async () => {
      await panel.init(container);
      await panel.scan();
    });

    it("returns all routes when no search or filters are active", () => {
      expect(panel.filteredRoutes).toHaveLength(3);
    });

    it("filters routes by path", () => {
      panel.routeSearch.setValue("/products");

      expect(panel.filteredRoutes).toHaveLength(1);
      expect(panel.filteredRoutes[ 0 ].id).toBe("route-3");
    });

    it("filters routes by handler", () => {
      panel.routeSearch.setValue("createProduct");

      expect(panel.filteredRoutes).toHaveLength(1);
      expect(panel.filteredRoutes[ 0 ].handler).toBe(
        "createProduct"
      );
    });

    it("filters routes by controller", () => {
      panel.routeSearch.setValue("UserController");

      expect(panel.filteredRoutes).toHaveLength(1);
      expect(panel.filteredRoutes[ 0 ].id).toBe("route-1");
    });

    it("filters routes by source file", () => {
      panel.routeSearch.setValue("products.js");

      expect(panel.filteredRoutes).toHaveLength(1);
      expect(panel.filteredRoutes[ 0 ].id).toBe("route-3");
    });

    it("filters routes by HTTP method", () => {
      panel.routeFilters.setFilter("method", "POST");

      expect(panel.filteredRoutes).toHaveLength(1);
      expect(panel.filteredRoutes[ 0 ].id).toBe("route-3");
    });

    it("filters routes by framework", () => {
      panel.routeFilters.setFilter("framework", "flask");

      expect(panel.filteredRoutes).toHaveLength(1);
      expect(panel.filteredRoutes[ 0 ].framework).toBe("flask");
    });

    it("combines search and filter conditions", () => {
      panel.routeFilters.setFilter("method", "GET");
      panel.routeSearch.setValue("/users");

      expect(panel.filteredRoutes).toHaveLength(2);
    });

    it("returns all matching routes after clearing search", () => {
      panel.routeSearch.setValue("/products");

      expect(panel.filteredRoutes).toHaveLength(1);

      panel.routeSearch.clear();

      expect(panel.filteredRoutes).toHaveLength(3);
    });

    it("returns all matching routes after resetting filters", () => {
      panel.routeFilters.setFilter("framework", "flask");

      expect(panel.filteredRoutes).toHaveLength(1);

      panel.routeFilters.reset();

      expect(panel.filteredRoutes).toHaveLength(3);
    });

    it("updates the route count", () => {
      panel.routeSearch.setValue("/products");

      const count = panel.element.querySelector(
        '[data-region="route-count"]'
      );

      expect(count.textContent).toBe("1 of 3 routes");
    });

    it("clears the selected route when it no longer matches", () => {
      const route = panel.routes[ 0 ];

      panel.selectRoute(route);

      expect(panel.selectedRoute).toBe(route);

      panel.routeSearch.setValue("/products");

      expect(panel.selectedRoute).toBeNull();
      expect(panel.routeDetails.route).toBeNull();
    });

    it("supports an empty search query", () => {
      panel.routeSearch.setValue("   ");

      expect(panel.routeSearch.getValue()).toBe("");
      expect(panel.filteredRoutes).toHaveLength(3);
    });
  });

  describe("route selection", () => {
    beforeEach(async () => {
      await panel.init(container);
      await panel.scan();
    });

    it("selects a route", () => {
      const route = panel.routes[ 0 ];

      const result = panel.selectRoute(route);

      expect(result).toBe(route);
      expect(panel.selectedRoute).toBe(route);
      expect(panel.routeList.getSelectedId()).toBe(route.id);
      expect(panel.routeDetails.route).toBe(route);
    });

    it("clears the current selection", () => {
      panel.selectRoute(panel.routes[ 0 ]);

      const result = panel.selectRoute(null);

      expect(result).toBeNull();
      expect(panel.selectedRoute).toBeNull();
      expect(panel.routeList.getSelectedId()).toBeNull();
      expect(panel.routeDetails.route).toBeNull();
    });

    it("selects a route through the route list callback", () => {
      const route = panel.routes[ 1 ];

      panel.routeList.selectRoute(route);

      expect(panel.selectedRoute).toBe(route);
      expect(panel.routeDetails.route).toBe(route);
    });

    it("rejects selection after destruction", () => {
      panel.destroy();

      expect(() => panel.selectRoute(null)).toThrow(
        "RouteLensPanel has been destroyed."
      );
    });
  });

  describe("navigation", () => {
    beforeEach(async () => {
      await panel.init(container);
      await panel.scan();
    });

    it("reports unavailable navigation when no navigator exists", async () => {
      const result = await panel.navigateToRoute(panel.routes[ 0 ]);

      expect(result).toBeNull();

      expect(
        panel.element.querySelector('[data-region="status"]').textContent
      ).toBe("Source navigation is unavailable.");
    });

    it("navigates to a route", async () => {
      const navigationResult = {
        file: "src/routes/users.js",
        line: 12
      };

      const navigator = {
        navigate: vi.fn().mockResolvedValue(navigationResult)
      };

      panel.navigator = navigator;

      const result = await panel.navigateToRoute(panel.routes[ 0 ]);

      expect(navigator.navigate).toHaveBeenCalledWith(
        panel.routes[ 0 ]
      );

      expect(result).toBe(navigationResult);

      expect(
        panel.element.querySelector('[data-region="status"]').textContent
      ).toBe("Opened src/routes/users.js at line 12.");
    });

    it("handles navigation without a line number", async () => {
      panel.navigator = {
        navigate: vi.fn().mockResolvedValue({
          file: "src/routes/users.js"
        })
      };

      await panel.navigateToRoute(panel.routes[ 0 ]);

      expect(
        panel.element.querySelector('[data-region="status"]').textContent
      ).toBe("Opened src/routes/users.js.");
    });

    it("handles navigation errors", async () => {
      const error = new Error("Source file not found");

      panel.navigator = {
        navigate: vi.fn().mockRejectedValue(error)
      };

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      const result = await panel.navigateToRoute(panel.routes[ 0 ]);

      expect(result).toBeNull();

      expect(
        panel.element.querySelector('[data-region="status"]').textContent
      ).toBe("Source file not found");

      expect(consoleError).toHaveBeenCalled();
    });

    it("rejects navigation after destruction", async () => {
      const route = panel.routes[ 0 ];

      panel.destroy();

      await expect(
        panel.navigateToRoute(route)
      ).rejects.toThrow("RouteLensPanel has been destroyed.");
    });
  });

  describe("statistics", () => {
    beforeEach(async () => {
      await panel.init(container);
      await panel.scan();
    });

    it("counts frameworks", () => {
      expect(panel.countFrameworks(panel.routes)).toEqual({
        express: 2,
        flask: 1
      });
    });

    it("counts HTTP methods", () => {
      expect(panel.countMethods(panel.routes)).toEqual({
        GET: 2,
        DELETE: 1,
        POST: 1
      });
    });

    it("counts unknown frameworks", () => {
      expect(
        panel.countFrameworks([
          createRoute({ framework: null }),
          createRoute({
            id: "another",
            framework: "express"
          })
        ])
      ).toEqual({
        unknown: 1,
        express: 1
      });
    });

    it("updates statistics after filtering", () => {
      panel.routeFilters.setFilter("framework", "flask");

      expect(panel.routeStatistics.data.total).toBe(3);
      expect(panel.routeStatistics.data.visible).toBe(1);

      expect(panel.routeStatistics.data.frameworks).toEqual({
        express: 2,
        flask: 1
      });
    });
  });

  describe("lifecycle", () => {
    it("removes the panel from its container when destroyed", async () => {
      await panel.init(container);

      expect(container.children).toHaveLength(1);

      panel.destroy();

      expect(container.children).toHaveLength(0);
      expect(panel.element).toBeNull();
      expect(panel.container).toBeNull();
    });

    it("destroys all child components", async () => {
      await panel.init(container);

      const components = [
        panel.routeList,
        panel.routeDetails,
        panel.routeFilters,
        panel.routeSearch,
        panel.routeStatistics
      ];

      panel.destroy();

      for (const component of components) {
        expect(component.destroyed).toBe(true);
      }
    });

    it("clears panel state when destroyed", async () => {
      await panel.init(container);
      await panel.scan();

      panel.selectRoute(panel.routes[ 0 ]);

      panel.destroy();

      expect(panel.routes).toEqual([]);
      expect(panel.filteredRoutes).toEqual([]);
      expect(panel.analysis).toBeNull();
      expect(panel.selectedRoute).toBeNull();
    });

    it("is safe to destroy more than once", async () => {
      await panel.init(container);

      expect(() => {
        panel.destroy();
        panel.destroy();
      }).not.toThrow();

      expect(panel.destroyed).toBe(true);
    });

    it("does not destroy the injected controller", async () => {
      controller.destroy = vi.fn();

      await panel.init(container);
      panel.destroy();

      expect(controller.destroy).not.toHaveBeenCalled();
    });

    it("does not destroy injected analyzer or navigator", async () => {
      const analyzer = {
        analyze: vi.fn().mockReturnValue({})
      };

      const navigator = {
        navigate: vi.fn()
      };

      panel = new RouteLensPanel({
        controller,
        analyzer,
        navigator
      });

      await panel.init(container);
      panel.destroy();

      expect(analyzer.destroy).toBeUndefined();
      expect(navigator.destroy).toBeUndefined();
    });
  });
});
