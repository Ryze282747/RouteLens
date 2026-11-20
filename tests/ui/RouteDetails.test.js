import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteDetails from "../../src/ui/RouteDetails.js";

class MockClassList {
  constructor() {
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
    this.classList = new MockClassList();
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
    this.textContent = "";

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
    handler: "getUsers",
    controller: "UserController",
    file: "src/routes/users.js",
    line: 10,
    ...overrides
  };
}

function getChildByClass(element, className) {
  if (!element || !Array.isArray(element.children)) {
    return undefined;
  }

  if (element.className === className) {
    return element;
  }

  for (const child of element.children) {
    const result = getChildByClass(child, className);

    if (result) {
      return result;
    }
  }

  return undefined;
}

function getElementsByClass(element, className) {
  const results = [];

  function visit(current) {
    if (current.className === className) {
      results.push(current);
    }

    for (const child of current.children) {
      visit(child);
    }
  }

  visit(element);

  return results;
}

describe("RouteDetails", () => {
  let details;
  let container;

  beforeEach(() => {
    details = new RouteDetails();
    container = createContainer();
  });

  describe("constructor", () => {
    it("initializes with default values", () => {
      expect(details.onNavigate).toBeNull();
      expect(details.element).toBeNull();
      expect(details.route).toBeNull();
      expect(details.destroyed).toBe(false);
    });

    it("accepts a navigation callback", () => {
      const onNavigate = vi.fn();

      const instance = new RouteDetails({
        onNavigate
      });

      expect(instance.onNavigate).toBe(onNavigate);
    });
  });

  describe("mount", () => {
    it("creates and mounts the details element", () => {
      const element = details.mount(container);

      expect(element.tagName).toBe("DIV");
      expect(element.className).toBe(
        "routelens-route-details"
      );

      expect(container.children).toContain(element);
      expect(details.element).toBe(element);
    });

    it("returns the mounted element", () => {
      const element = details.mount(container);

      expect(element).toBe(details.element);
    });

    it("renders the empty state when no route is selected", () => {
      details.mount(container);

      const empty = getChildByClass(
        details.element,
        "routelens-details-empty"
      );

      expect(empty).toBeDefined();
      expect(empty.children[ 0 ].textContent).toBe(
        "Route Details"
      );

      expect(empty.children[ 1 ].textContent).toBe(
        "Select a route to inspect its information."
      );
    });

    it("renders an existing route when mounted", () => {
      details.setRoute(createRoute());

      details.mount(container);

      expect(
        getChildByClass(
          details.element,
          "routelens-details-header"
        )
      ).toBeDefined();
    });

    it("removes the previous element when mounted again", () => {
      const firstContainer = createContainer();
      const secondContainer = createContainer();

      const firstElement = details.mount(firstContainer);
      const secondElement = details.mount(secondContainer);

      expect(firstElement.removed).toBe(true);
      expect(firstContainer.children).toHaveLength(0);

      expect(secondContainer.children).toContain(
        secondElement
      );

      expect(details.element).toBe(secondElement);
    });

    it("rejects an invalid container", () => {
      expect(() => {
        details.mount(null);
      }).toThrow(
        "A valid container element is required."
      );

      expect(() => {
        details.mount({});
      }).toThrow(
        "A valid container element is required."
      );
    });
  });

  describe("setRoute", () => {
    it("accepts a valid route", () => {
      const route = createRoute();

      details.setRoute(route);

      expect(details.route).toBe(route);
    });

    it("accepts null to clear the selected route", () => {
      details.setRoute(createRoute());
      details.setRoute(null);

      expect(details.route).toBeNull();
    });

    it("renders the empty state after clearing the route", () => {
      details.mount(container);
      details.setRoute(createRoute());
      details.setRoute(null);

      expect(
        getChildByClass(
          details.element,
          "routelens-details-empty"
        )
      ).toBeDefined();
    });

    it("rejects primitive route values", () => {
      expect(() => {
        details.setRoute("invalid");
      }).toThrow(
        "Route details must be an object or null."
      );

      expect(() => {
        details.setRoute(123);
      }).toThrow(
        "Route details must be an object or null."
      );

      expect(() => {
        details.setRoute(true);
      }).toThrow(
        "Route details must be an object or null."
      );
    });

    it("rejects array route values", () => {
      expect(() => {
        details.setRoute([]);
      }).toThrow(
        "Route details must be an object or null."
      );
    });

    it("updates the rendered route when changed", () => {
      details.mount(container);

      details.setRoute(createRoute({
        path: "/users"
      }));

      details.setRoute(createRoute({
        path: "/products"
      }));

      const header = getChildByClass(
        details.element,
        "routelens-details-header"
      );

      expect(
        getChildByClass(
          header,
          "routelens-details-path"
        ).textContent
      ).toBe("/products");
    });
  });

  describe("header rendering", () => {
    it("renders the route title", () => {
      details.mount(container);
      details.setRoute(createRoute());

      const header = getChildByClass(
        details.element,
        "routelens-details-header"
      );

      expect(header.children[ 0 ].textContent).toBe(
        "Route Details"
      );
    });

    it("renders the route path", () => {
      details.mount(container);
      details.setRoute(createRoute({
        path: "/api/users"
      }));

      const header = getChildByClass(
        details.element,
        "routelens-details-header"
      );

      expect(
        getChildByClass(
          header,
          "routelens-details-path"
        ).textContent
      ).toBe("/api/users");
    });

    it("uses a fallback path when the path is missing", () => {
      details.mount(container);
      details.setRoute(createRoute({
        path: null
      }));

      const header = getChildByClass(
        details.element,
        "routelens-details-header"
      );

      expect(
        getChildByClass(
          header,
          "routelens-details-path"
        ).textContent
      ).toBe("/");
    });

    it("renders method badges", () => {
      details.mount(container);
      details.setRoute(createRoute({
        methods: [ "GET", "POST", "DELETE" ]
      }));

      const header = getChildByClass(
        details.element,
        "routelens-details-header"
      );

      const methods = getChildByClass(
        header,
        "routelens-details-methods"
      );

      expect(methods.children).toHaveLength(3);

      expect(
        methods.children.map((badge) => badge.textContent)
      ).toEqual([ "GET", "POST", "DELETE" ]);
    });

    it("normalizes method badge CSS classes", () => {
      details.mount(container);
      details.setRoute(createRoute({
        methods: [ "CUSTOM METHOD", "GET/POST" ]
      }));

      const methods = getChildByClass(
        getChildByClass(
          details.element,
          "routelens-details-header"
        ),
        "routelens-details-methods"
      );

      expect(methods.children[ 0 ].className).toBe(
        "routelens-method-badge method-custom-method"
      );

      expect(methods.children[ 1 ].className).toBe(
        "routelens-method-badge method-get-post"
      );
    });

    it("ignores invalid method entries", () => {
      details.mount(container);
      details.setRoute(createRoute({
        methods: [
          "GET",
          null,
          undefined,
          "",
          123,
          {},
          "POST"
        ]
      }));

      const methods = getChildByClass(
        getChildByClass(
          details.element,
          "routelens-details-header"
        ),
        "routelens-details-methods"
      );

      expect(
        methods.children.map((badge) => badge.textContent)
      ).toEqual([ "GET", "POST" ]);
    });

    it("handles malformed methods properties", () => {
      details.mount(container);

      expect(() => {
        details.setRoute(createRoute({
          methods: "GET"
        }));
      }).not.toThrow();

      const methods = getChildByClass(
        getChildByClass(
          details.element,
          "routelens-details-header"
        ),
        "routelens-details-methods"
      );

      expect(methods.children).toHaveLength(0);
    });
  });

  describe("route information", () => {
    it("renders framework information", () => {
      details.mount(container);
      details.setRoute(createRoute({
        framework: "Flask"
      }));

      const rows = getElementsByClass(
        details.element,
        "routelens-detail-row"
      );

      expect(
        rows.some((row) => {
          return (
            row.children[ 0 ].textContent === "Framework" &&
            row.children[ 1 ].textContent === "Flask"
          );
        })
      ).toBe(true);
    });

    it("renders handler and controller information", () => {
      details.mount(container);
      details.setRoute(createRoute({
        handler: "get_users",
        controller: "UserController"
      }));

      const rows = getElementsByClass(
        details.element,
        "routelens-detail-row"
      );

      const values = rows.map((row) => {
        return [
          row.children[ 0 ].textContent,
          row.children[ 1 ].textContent
        ];
      });

      expect(values).toContainEqual([
        "Handler",
        "get_users"
      ]);

      expect(values).toContainEqual([
        "Controller",
        "UserController"
      ]);
    });

    it("renders blueprint, router, and prefix information", () => {
      details.mount(container);
      details.setRoute(createRoute({
        blueprint: "api",
        router: "userRouter",
        prefix: "/api/v1"
      }));

      const rows = getElementsByClass(
        details.element,
        "routelens-detail-row"
      );

      const values = rows.map((row) => {
        return [
          row.children[ 0 ].textContent,
          row.children[ 1 ].textContent
        ];
      });

      expect(values).toContainEqual([
        "Blueprint",
        "api"
      ]);

      expect(values).toContainEqual([
        "Router",
        "userRouter"
      ]);

      expect(values).toContainEqual([
        "Prefix",
        "/api/v1"
      ]);
    });

    it("does not render an empty route information section", () => {
      details.mount(container);
      details.setRoute({
        path: "/users",
        methods: []
      });

      const sections = getElementsByClass(
        details.element,
        "routelens-details-section"
      );

      expect(
        sections.some((section) => {
          return section.children[ 0 ].textContent ===
            "Route Information";
        })
      ).toBe(false);
    });

    it("preserves numeric zero values", () => {
      details.mount(container);
      details.setRoute(createRoute({
        line: 0,
        handler: 0
      }));

      const rows = getElementsByClass(
        details.element,
        "routelens-detail-row"
      );

      const values = rows.map((row) => {
        return [
          row.children[ 0 ].textContent,
          row.children[ 1 ].textContent
        ];
      });

      expect(values).toContainEqual([
        "Handler",
        "0"
      ]);

      expect(values).toContainEqual([
        "Line",
        "0"
      ]);
    });
  });

  describe("source metadata", () => {
    it("renders the source file and line", () => {
      details.mount(container);
      details.setRoute(createRoute({
        file: "app/routes.py",
        line: 25
      }));

      const rows = getElementsByClass(
        details.element,
        "routelens-detail-row"
      );

      const values = rows.map((row) => {
        return [
          row.children[ 0 ].textContent,
          row.children[ 1 ].textContent
        ];
      });

      expect(values).toContainEqual([
        "File",
        "app/routes.py"
      ]);

      expect(values).toContainEqual([
        "Line",
        "25"
      ]);
    });

    it("does not render an empty source section", () => {
      details.mount(container);
      details.setRoute(createRoute({
        file: null,
        line: null
      }));

      const sections = getElementsByClass(
        details.element,
        "routelens-details-section"
      );

      expect(
        sections.some((section) => {
          return section.children[ 0 ].textContent ===
            "Source Location";
        })
      ).toBe(false);
    });

    it("renders additional metadata", () => {
      details.mount(container);
      details.setRoute(createRoute({
        metadata: {
          middleware: "auth",
          rate_limit: 100
        }
      }));

      const sections = getElementsByClass(
        details.element,
        "routelens-details-section"
      );

      const metadataSection = sections.find((section) => {
        return section.children[ 0 ].textContent ===
          "Additional Metadata";
      });

      expect(metadataSection).toBeDefined();

      const rows = metadataSection.children.slice(1);

      expect(
        rows.map((row) => row.children[ 0 ].textContent)
      ).toEqual([
        "Middleware",
        "Rate Limit"
      ]);
    });

    it("handles null and primitive metadata", () => {
      details.mount(container);

      expect(() => {
        details.setRoute(createRoute({
          metadata: null
        }));
      }).not.toThrow();

      expect(() => {
        details.setRoute(createRoute({
          metadata: "invalid"
        }));
      }).not.toThrow();

      expect(() => {
        details.setRoute(createRoute({
          metadata: 123
        }));
      }).not.toThrow();
    });

    it("ignores array metadata", () => {
      details.mount(container);
      details.setRoute(createRoute({
        metadata: [ "one", "two" ]
      }));

      const sections = getElementsByClass(
        details.element,
        "routelens-details-section"
      );

      expect(
        sections.some((section) => {
          return section.children[ 0 ].textContent ===
            "Additional Metadata";
        })
      ).toBe(false);
    });

    it("renders nested metadata values", () => {
      details.mount(container);
      details.setRoute(createRoute({
        metadata: {
          configuration: {
            auth: true,
            roles: [ "admin", "user" ]
          }
        }
      }));

      const values = getElementsByClass(
        details.element,
        "routelens-detail-value"
      );

      expect(
        values.some((value) => {
          return value.textContent.includes('"auth": true');
        })
      ).toBe(true);
    });

    it("handles circular metadata without throwing", () => {
      const metadata = {};
      metadata.self = metadata;

      details.mount(container);

      expect(() => {
        details.setRoute(createRoute({
          metadata
        }));
      }).not.toThrow();

      const values = getElementsByClass(
        details.element,
        "routelens-detail-value"
      );

      expect(
        values.some((value) => {
          return value.textContent ===
            "[Unserializable value]";
        })
      ).toBe(true);
    });
  });

  describe("source declaration", () => {
    it("renders a string source declaration", () => {
      details.mount(container);
      details.setRoute(createRoute({
        source: "app.route('/users', get_users)"
      }));

      const code = getChildByClass(
        details.element,
        "routelens-source-code"
      );

      expect(code).toBeDefined();
      expect(code.children[ 0 ].textContent).toBe(
        "app.route('/users', get_users)"
      );
    });

    it("renders an object expression when available", () => {
      details.mount(container);
      details.setRoute(createRoute({
        source: {
          expression: "router.get('/users', handler)",
          line: 10
        }
      }));

      const code = getChildByClass(
        details.element,
        "routelens-source-code"
      );

      expect(code.children[ 0 ].textContent).toBe(
        "router.get('/users', handler)"
      );
    });

    it("serializes source objects without expressions", () => {
      details.mount(container);
      details.setRoute(createRoute({
        source: {
          type: "route-declaration",
          line: 10
        }
      }));

      const code = getChildByClass(
        details.element,
        "routelens-source-code"
      );

      expect(code.children[ 0 ].textContent).toContain(
        '"type": "route-declaration"'
      );
    });

    it("handles circular source objects safely", () => {
      const source = {};
      source.self = source;

      details.mount(container);

      expect(() => {
        details.setRoute(createRoute({
          source
        }));
      }).not.toThrow();

      const code = getChildByClass(
        details.element,
        "routelens-source-code"
      );

      expect(code.children[ 0 ].textContent).toBe(
        "[Unserializable value]"
      );
    });

    it("does not render an empty source declaration", () => {
      details.mount(container);
      details.setRoute(createRoute({
        source: ""
      }));

      expect(
        getChildByClass(
          details.element,
          "routelens-source-code"
        )
      ).toBeUndefined();
    });
  });

  describe("formatting helpers", () => {
    it("formats camelCase labels", () => {
      expect(details.formatLabel("routeName")).toBe(
        "Route Name"
      );
    });

    it("formats snake_case labels", () => {
      expect(details.formatLabel("route_name")).toBe(
        "Route Name"
      );
    });

    it("formats kebab-case labels", () => {
      expect(details.formatLabel("route-name")).toBe(
        "Route Name"
      );
    });

    it("formats null and undefined values", () => {
      expect(details.formatValue(null)).toBe("None");
      expect(details.formatValue(undefined)).toBe("None");
    });

    it("formats primitive values", () => {
      expect(details.formatValue("hello")).toBe("hello");
      expect(details.formatValue(123)).toBe("123");
      expect(details.formatValue(true)).toBe("true");
      expect(details.formatValue(10n)).toBe("10");
    });

    it("formats functions and symbols", () => {
      expect(details.formatValue(() => { })).toBe(
        "[Function]"
      );

      expect(details.formatValue(Symbol("test"))).toBe(
        "Symbol(test)"
      );
    });

    it("formats arrays and objects", () => {
      expect(details.formatValue([ "GET", "POST" ])).toBe(
        '[\n  "GET",\n  "POST"\n]'
      );

      expect(details.formatValue({
        enabled: true
      })).toBe(
        '{\n  "enabled": true\n}'
      );
    });

    it("uses fallback values for missing display values", () => {
      expect(
        details.toDisplayString(null, "Fallback")
      ).toBe("Fallback");

      expect(
        details.toDisplayString("", "Fallback")
      ).toBe("Fallback");
    });

    it("converts primitive display values to strings", () => {
      expect(details.toDisplayString(0)).toBe("0");
      expect(details.toDisplayString(false)).toBe("false");
    });
  });

  describe("navigation", () => {
    it("renders the Open Source button", () => {
      details.mount(container);
      details.setRoute(createRoute());

      const actions = getChildByClass(
        details.element,
        "routelens-details-actions"
      );

      expect(actions).toBeDefined();
      expect(actions.children).toHaveLength(1);

      expect(actions.children[ 0 ].textContent).toBe(
        "Open Source"
      );
    });

    it("calls the navigation callback with the current route", () => {
      const onNavigate = vi.fn();

      details = new RouteDetails({
        onNavigate
      });

      details.mount(container);

      const route = createRoute();

      details.setRoute(route);

      const button = getChildByClass(
        details.element,
        "routelens-details-actions"
      ).children[ 0 ];

      button.dispatchEvent("click");

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(route);
    });

    it("uses the latest route when navigating", () => {
      const onNavigate = vi.fn();

      details = new RouteDetails({
        onNavigate
      });

      details.mount(container);

      details.setRoute(createRoute({
        path: "/first"
      }));

      details.setRoute(createRoute({
        path: "/second"
      }));

      const button = getChildByClass(
        details.element,
        "routelens-details-actions"
      ).children[ 0 ];

      button.dispatchEvent("click");

      expect(onNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/second"
        })
      );
    });

    it("does nothing when no navigation callback exists", () => {
      details.mount(container);
      details.setRoute(createRoute());

      const button = getChildByClass(
        details.element,
        "routelens-details-actions"
      ).children[ 0 ];

      expect(() => {
        button.dispatchEvent("click");
      }).not.toThrow();
    });

    it("does not navigate after the route is cleared", () => {
      const onNavigate = vi.fn();

      details = new RouteDetails({
        onNavigate
      });

      details.mount(container);
      details.setRoute(createRoute());

      const oldButton = getChildByClass(
        details.element,
        "routelens-details-actions"
      ).children[ 0 ];

      details.setRoute(null);

      oldButton.dispatchEvent("click");

      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("removes the mounted element", () => {
      const element = details.mount(container);

      details.destroy();

      expect(element.removed).toBe(true);
      expect(container.children).toHaveLength(0);
      expect(details.element).toBeNull();
    });

    it("clears internal state and callbacks", () => {
      details = new RouteDetails({
        onNavigate: vi.fn()
      });

      details.setRoute(createRoute());
      details.mount(container);

      details.destroy();

      expect(details.element).toBeNull();
      expect(details.route).toBeNull();
      expect(details.onNavigate).toBeNull();
      expect(details.destroyed).toBe(true);
    });

    it("is safe to call multiple times", () => {
      expect(() => {
        details.destroy();
        details.destroy();
      }).not.toThrow();
    });

    it("prevents stale navigation handlers from invoking callbacks", () => {
      const onNavigate = vi.fn();

      details = new RouteDetails({
        onNavigate
      });

      details.mount(container);
      details.setRoute(createRoute());

      const button = getChildByClass(
        details.element,
        "routelens-details-actions"
      ).children[ 0 ];

      details.destroy();

      expect(() => {
        button.dispatchEvent("click");
      }).not.toThrow();

      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe("destroyed-state protection", () => {
    it("rejects operations after destruction", () => {
      details.destroy();

      expect(() => details.mount(container)).toThrow(
        "RouteDetails has been destroyed."
      );

      expect(() => details.setRoute(createRoute())).toThrow(
        "RouteDetails has been destroyed."
      );

      expect(() => details.setRoute(null)).toThrow(
        "RouteDetails has been destroyed."
      );

      expect(() => details.render()).toThrow(
        "RouteDetails has been destroyed."
      );
    });
  });
});
