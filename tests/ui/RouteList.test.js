import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteList from "../../src/ui/RouteList.js";

class MockClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.classList = new MockClassList(this);
    this.children = [];
    this.parentElement = null;
    this.textContent = "";
    this.attributes = {};
    this.listeners = {};
    this.type = "";
    this.removed = false;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }

    this.children.push(child);
    child.parentElement = this;

    return child;
  }

  append(...children) {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentElement = null;
    }

    this.children = [];

    for (const child of children) {
      this.appendChild(child);
    }
  }

  removeChild(child) {
    const index = this.children.indexOf(child);

    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentElement = null;
    }

    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }

    this.removed = true;
  }

  addEventListener(type, callback) {
    if (!this.listeners[ type ]) {
      this.listeners[ type ] = [];
    }

    this.listeners[ type ].push(callback);
  }

  removeEventListener(type, callback) {
    if (!this.listeners[ type ]) {
      return;
    }

    this.listeners[ type ] = this.listeners[ type ].filter(
      (listener) => listener !== callback
    );
  }

  dispatchEvent(type, event = {}) {
    const normalizedEvent = {
      stopPropagation: vi.fn(),
      ...event
    };

    for (const listener of this.listeners[ type ] || []) {
      listener(normalizedEvent);
    }

    return normalizedEvent;
  }

  setAttribute(name, value) {
    this.attributes[ name ] = String(value);
  }

  getAttribute(name) {
    return this.attributes[ name ] ?? null;
  }
}

beforeEach(() => {
  globalThis.document = {
    createElement: vi.fn((tagName) => {
      return new MockElement(tagName);
    })
  };
});

function createContainer() {
  return new MockElement("div");
}

function createRoute(overrides = {}) {
  return {
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    framework: "express",
    file: "src/routes/users.js",
    line: 10,
    ...overrides
  };
}

function getRouteItems(element) {
  return element.children.filter((child) => {
    return child.className === "routelens-route-item";
  });
}

function getChildByClass(element, className) {
  return element.children.find((child) => {
    return child.className === className;
  });
}

describe("RouteList", () => {
  let routeList;
  let container;

  beforeEach(() => {
    routeList = new RouteList();
    container = createContainer();
  });

  describe("constructor", () => {
    it("initializes with default values", () => {
      expect(routeList.element).toBeNull();
      expect(routeList.routes).toEqual([]);
      expect(routeList.selectedId).toBeNull();
      expect(routeList.destroyed).toBe(false);
      expect(routeList.onSelect).toBeNull();
      expect(routeList.onNavigate).toBeNull();
    });

    it("accepts selection and navigation callbacks", () => {
      const onSelect = vi.fn();
      const onNavigate = vi.fn();

      const instance = new RouteList({
        onSelect,
        onNavigate
      });

      expect(instance.onSelect).toBe(onSelect);
      expect(instance.onNavigate).toBe(onNavigate);
    });
  });

  describe("mount", () => {
    it("creates and mounts the route list element", () => {
      const element = routeList.mount(container);

      expect(element.tagName).toBe("DIV");
      expect(element.className).toBe(
        "routelens-route-list"
      );

      expect(container.children).toContain(element);
      expect(routeList.element).toBe(element);
    });

    it("returns the mounted element", () => {
      const element = routeList.mount(container);

      expect(routeList.mount).toBeDefined();
      expect(element).toBe(routeList.element);
    });

    it("renders existing routes when mounted", () => {
      const route = createRoute();

      routeList.setRoutes([ route ]);

      const element = routeList.mount(container);

      expect(getRouteItems(element)).toHaveLength(1);
    });

    it("removes the previous element when mounted again", () => {
      const firstContainer = createContainer();
      const secondContainer = createContainer();

      const firstElement = routeList.mount(firstContainer);
      const secondElement = routeList.mount(secondContainer);

      expect(firstElement.removed).toBe(true);
      expect(firstContainer.children).toHaveLength(0);

      expect(secondContainer.children).toContain(
        secondElement
      );

      expect(routeList.element).toBe(secondElement);
    });

    it("rejects an invalid container", () => {
      expect(() => {
        routeList.mount(null);
      }).toThrow(
        "A valid container element is required."
      );

      expect(() => {
        routeList.mount({});
      }).toThrow(
        "A valid container element is required."
      );
    });
  });

  describe("setRoutes", () => {
    it("stores and renders routes", () => {
      const routes = [
        createRoute(),
        createRoute({
          id: "route-2",
          path: "/products"
        })
      ];

      routeList.mount(container);
      routeList.setRoutes(routes);

      expect(routeList.getRoutes()).toEqual(routes);
      expect(getRouteItems(routeList.element)).toHaveLength(2);
    });

    it("rejects non-array route values", () => {
      expect(() => {
        routeList.setRoutes(null);
      }).toThrow(
        "Routes must be provided as an array."
      );

      expect(() => {
        routeList.setRoutes({});
      }).toThrow(
        "Routes must be provided as an array."
      );
    });

    it("filters null and malformed route entries", () => {
      const validRoute = createRoute();

      routeList.mount(container);

      routeList.setRoutes([
        validRoute,
        null,
        undefined,
        "invalid",
        123,
        [],
        {}
      ]);

      expect(routeList.routes).toEqual([
        validRoute,
        {}
      ]);

      expect(getRouteItems(routeList.element)).toHaveLength(2);
    });

    it("clears the selected ID when its route no longer exists", () => {
      routeList.setRoutes([
        createRoute()
      ]);

      routeList.setSelected("route-1");

      routeList.setRoutes([
        createRoute({
          id: "route-2"
        })
      ]);

      expect(routeList.getSelectedId()).toBeNull();
    });

    it("preserves selection when the selected route still exists", () => {
      routeList.setRoutes([
        createRoute(),
        createRoute({
          id: "route-2"
        })
      ]);

      routeList.setSelected("route-1");

      routeList.setRoutes([
        createRoute({
          id: "route-1",
          path: "/updated"
        }),
        createRoute({
          id: "route-2"
        })
      ]);

      expect(routeList.getSelectedId()).toBe("route-1");
    });

    it("supports numeric route IDs", () => {
      routeList.setRoutes([
        createRoute({
          id: 0
        })
      ]);

      routeList.setSelected(0);

      expect(routeList.getSelectedId()).toBe(0);
    });
  });

  describe("setSelected", () => {
    it("updates the selected route ID", () => {
      routeList.setSelected("route-1");

      expect(routeList.getSelectedId()).toBe("route-1");
    });

    it("accepts numeric zero as a valid ID", () => {
      routeList.setSelected(0);

      expect(routeList.getSelectedId()).toBe(0);
    });

    it("clears selection when given null", () => {
      routeList.setSelected("route-1");
      routeList.setSelected(null);

      expect(routeList.getSelectedId()).toBeNull();
    });

    it("updates the rendered selected state", () => {
      routeList.mount(container);

      routeList.setRoutes([
        createRoute(),
        createRoute({
          id: "route-2"
        })
      ]);

      routeList.setSelected("route-2");

      const items = getRouteItems(routeList.element);

      expect(
        items[ 0 ].classList.contains("is-selected")
      ).toBe(false);

      expect(
        items[ 1 ].classList.contains("is-selected")
      ).toBe(true);
    });
  });

  describe("render", () => {
    it("renders the empty state when there are no routes", () => {
      routeList.mount(container);

      const empty = getChildByClass(
        routeList.element,
        "routelens-empty-state"
      );

      expect(empty).toBeDefined();
      expect(empty.textContent).toBe("No routes found.");
    });

    it("renders route paths", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute({
          path: "/api/users"
        })
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];

      const header = item.children[ 0 ];
      const path = getChildByClass(
        header,
        "routelens-route-path"
      );

      expect(path.textContent).toBe("/api/users");
    });

    it("uses a fallback path when the path is missing", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute({
          path: null
        })
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const path = getChildByClass(
        item.children[ 0 ],
        "routelens-route-path"
      );

      expect(path.textContent).toBe("/");
    });

    it("renders method badges", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute({
          methods: [ "GET", "POST", "DELETE" ]
        })
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const methodGroup = getChildByClass(
        item.children[ 0 ],
        "routelens-method-group"
      );

      expect(methodGroup.children).toHaveLength(3);
      expect(
        methodGroup.children.map((badge) => badge.textContent)
      ).toEqual([ "GET", "POST", "DELETE" ]);
    });

    it("normalizes method badge CSS classes", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute({
          methods: [ "CUSTOM METHOD", "GET/POST" ]
        })
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const methodGroup = getChildByClass(
        item.children[ 0 ],
        "routelens-method-group"
      );

      expect(methodGroup.children[ 0 ].className).toBe(
        "routelens-method-badge method-custom-method"
      );

      expect(methodGroup.children[ 1 ].className).toBe(
        "routelens-method-badge method-get-post"
      );
    });

    it("ignores invalid method entries", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute({
          methods: [
            "GET",
            null,
            undefined,
            "",
            123,
            {},
            "POST"
          ]
        })
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const methodGroup = getChildByClass(
        item.children[ 0 ],
        "routelens-method-group"
      );

      expect(
        methodGroup.children.map((badge) => badge.textContent)
      ).toEqual([ "GET", "POST" ]);
    });

    it("handles a malformed methods property", () => {
      routeList.mount(container);

      expect(() => {
        routeList.setRoutes([
          createRoute({
            methods: "GET"
          })
        ]);
      }).not.toThrow();

      const item = getRouteItems(routeList.element)[ 0 ];
      const methodGroup = getChildByClass(
        item.children[ 0 ],
        "routelens-method-group"
      );

      expect(methodGroup.children).toHaveLength(0);
    });

    it("renders framework and source metadata", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute({
          framework: "Flask",
          file: "app/routes.py",
          line: 25
        })
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const metadata = item.children[ 1 ];

      expect(metadata.children[ 0 ].textContent).toBe("Flask");
      expect(metadata.children[ 1 ].textContent).toBe(
        "app/routes.py:25"
      );
    });

    it("uses fallback metadata when values are missing", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute({
          framework: null,
          file: null,
          line: null
        })
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const metadata = item.children[ 1 ];

      expect(metadata.children[ 0 ].textContent).toBe(
        "Unknown framework"
      );

      expect(metadata.children[ 1 ].textContent).toBe(
        "Unknown source"
      );
    });

    it("supports line number zero", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute({
          line: 0
        })
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const metadata = item.children[ 1 ];

      expect(metadata.children[ 1 ].textContent).toBe(
        "src/routes/users.js:0"
      );
    });

    it("renders action buttons", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute()
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const actions = item.children[ 2 ];

      expect(actions.children).toHaveLength(2);
      expect(actions.children[ 0 ].textContent).toBe("Details");
      expect(actions.children[ 1 ].textContent).toBe("Open Source");
    });
  });

  describe("selection callbacks", () => {
    it("selects a route when its item is clicked", () => {
      const onSelect = vi.fn();

      routeList = new RouteList({
        onSelect
      });

      routeList.mount(container);

      const route = createRoute();

      routeList.setRoutes([ route ]);

      const item = getRouteItems(routeList.element)[ 0 ];

      item.dispatchEvent("click");

      expect(routeList.getSelectedId()).toBe("route-1");
      expect(onSelect).toHaveBeenCalledWith(route);
    });

    it("selects a route using the Details button", () => {
      const onSelect = vi.fn();

      routeList = new RouteList({
        onSelect
      });

      routeList.mount(container);

      const route = createRoute();

      routeList.setRoutes([ route ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const actions = item.children[ 2 ];
      const button = actions.children[ 0 ];

      const event = button.dispatchEvent("click");

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(routeList.getSelectedId()).toBe("route-1");
      expect(onSelect).toHaveBeenCalledWith(route);
    });

    it("updates the selection before invoking the callback", () => {
      const onSelect = vi.fn(() => {
        expect(routeList.getSelectedId()).toBe("route-1");
      });

      routeList = new RouteList({
        onSelect
      });

      const route = createRoute();

      routeList.selectRoute(route);

      expect(onSelect).toHaveBeenCalledWith(route);
    });

    it("updates the Details button accessibility state", () => {
      routeList.mount(container);
      routeList.setRoutes([
        createRoute()
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const button = item.children[ 2 ].children[ 0 ];

      expect(button.getAttribute("aria-pressed")).toBe(
        "false"
      );

      routeList.setSelected("route-1");

      const updatedItem = getRouteItems(routeList.element)[ 0 ];
      const updatedButton = updatedItem.children[ 2 ].children[ 0 ];

      expect(updatedButton.getAttribute("aria-pressed")).toBe(
        "true"
      );
    });
  });

  describe("navigation callbacks", () => {
    it("calls the navigation callback with the selected route", () => {
      const onNavigate = vi.fn();

      routeList = new RouteList({
        onNavigate
      });

      const route = createRoute();

      routeList.navigateToRoute(route);

      expect(onNavigate).toHaveBeenCalledWith(route);
    });

    it("navigates when the Open Source button is clicked", () => {
      const onNavigate = vi.fn();

      routeList = new RouteList({
        onNavigate
      });

      routeList.mount(container);

      const route = createRoute();

      routeList.setRoutes([ route ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const button = item.children[ 2 ].children[ 1 ];

      const event = button.dispatchEvent("click");

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(onNavigate).toHaveBeenCalledWith(route);
    });

    it("does not require a navigation callback", () => {
      expect(() => {
        routeList.navigateToRoute(createRoute());
      }).not.toThrow();
    });
  });

  describe("validation", () => {
    it("rejects invalid routes during selection", () => {
      expect(() => {
        routeList.selectRoute(null);
      }).toThrow(
        "A valid route object is required."
      );

      expect(() => {
        routeList.selectRoute([]);
      }).toThrow(
        "A valid route object is required."
      );
    });

    it("rejects invalid routes during navigation", () => {
      expect(() => {
        routeList.navigateToRoute(null);
      }).toThrow(
        "A valid route object is required."
      );

      expect(() => {
        routeList.navigateToRoute([]);
      }).toThrow(
        "A valid route object is required."
      );
    });
  });

  describe("getters", () => {
    it("returns a copy of the routes array", () => {
      const route = createRoute();

      routeList.setRoutes([ route ]);

      const routes = routeList.getRoutes();

      routes.push(createRoute({
        id: "another"
      }));

      expect(routeList.getRoutes()).toHaveLength(1);
    });

    it("returns the current selected ID", () => {
      routeList.setSelected("route-1");

      expect(routeList.getSelectedId()).toBe("route-1");
    });
  });

  describe("destroy", () => {
    it("removes the mounted element", () => {
      const element = routeList.mount(container);

      routeList.destroy();

      expect(element.removed).toBe(true);
      expect(container.children).toHaveLength(0);
      expect(routeList.element).toBeNull();
    });

    it("clears internal state and callbacks", () => {
      routeList = new RouteList({
        onSelect: vi.fn(),
        onNavigate: vi.fn()
      });

      routeList.setRoutes([
        createRoute()
      ]);

      routeList.setSelected("route-1");

      routeList.destroy();

      expect(routeList.routes).toEqual([]);
      expect(routeList.selectedId).toBeNull();
      expect(routeList.onSelect).toBeNull();
      expect(routeList.onNavigate).toBeNull();
      expect(routeList.destroyed).toBe(true);
    });

    it("is safe to call multiple times", () => {
      expect(() => {
        routeList.destroy();
        routeList.destroy();
      }).not.toThrow();
    });

    it("prevents stale click handlers from invoking callbacks", () => {
      const onSelect = vi.fn();
      const onNavigate = vi.fn();

      routeList = new RouteList({
        onSelect,
        onNavigate
      });

      routeList.mount(container);
      routeList.setRoutes([
        createRoute()
      ]);

      const item = getRouteItems(routeList.element)[ 0 ];
      const actions = item.children[ 2 ];

      const detailsButton = actions.children[ 0 ];
      const navigateButton = actions.children[ 1 ];

      routeList.destroy();

      expect(() => {
        item.dispatchEvent("click");
        detailsButton.dispatchEvent("click");
        navigateButton.dispatchEvent("click");
      }).not.toThrow();

      expect(onSelect).not.toHaveBeenCalled();
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe("destroyed-state protection", () => {
    it("rejects operations after destruction", () => {
      routeList.destroy();

      expect(() => routeList.mount(container)).toThrow(
        "RouteList has been destroyed."
      );

      expect(() => routeList.setRoutes([])).toThrow(
        "RouteList has been destroyed."
      );

      expect(() => routeList.setSelected("route-1")).toThrow(
        "RouteList has been destroyed."
      );

      expect(() => routeList.render()).toThrow(
        "RouteList has been destroyed."
      );

      expect(() => routeList.getRoutes()).toThrow(
        "RouteList has been destroyed."
      );

      expect(() => routeList.getSelectedId()).toThrow(
        "RouteList has been destroyed."
      );

      expect(() => routeList.selectRoute(createRoute())).toThrow(
        "RouteList has been destroyed."
      );

      expect(() => routeList.navigateToRoute(createRoute())).toThrow(
        "RouteList has been destroyed."
      );
    });

    it("rejects direct route element creation after destruction", () => {
      routeList.destroy();

      expect(() => {
        routeList.createRouteElement(createRoute());
      }).toThrow(
        "RouteList has been destroyed."
      );
    });
  });
});
