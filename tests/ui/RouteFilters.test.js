import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteFilters from "../../src/ui/RouteFilters.js";

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.value = "";
    this.textContent = "";
    this.type = "";
    this.listeners = {};
    this.removed = false;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.remove();
    }

    this.children.push(child);
    child.parentElement = this;

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

    for (const element of elements) {
      this.appendChild(element);
    }
  }

  remove() {
    if (this.parentElement) {
      const index = this.parentElement.children.indexOf(this);

      if (index !== -1) {
        this.parentElement.children.splice(index, 1);
      }

      this.parentElement = null;
    }

    this.removed = true;
  }

  addEventListener(type, callback) {
    if (!this.listeners[ type ]) {
      this.listeners[ type ] = [];
    }

    this.listeners[ type ].push(callback);
  }

  dispatchEvent(event) {
    const callbacks = this.listeners[ event.type ] || [];

    for (const callback of callbacks) {
      callback(event);
    }
  }

  querySelector(selector) {
    const match = selector.match(
      /^\[data-filter="([^"]+)"\]$/
    );

    if (!match) {
      return null;
    }

    const key = match[ 1 ];

    for (const child of this.children) {
      if (child.dataset?.filter === key) {
        return child;
      }

      const nested = child.querySelector(selector);

      if (nested) {
        return nested;
      }
    }

    return null;
  }
}

function createContainer() {
  return new MockElement("div");
}

function getSelect(filters, key) {
  return filters.element.querySelector(
    `[data-filter="${key}"]`
  );
}

function getOptionValues(select) {
  return select.children.map((option) => option.value);
}

describe("RouteFilters", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: vi.fn((tagName) => {
        return new MockElement(tagName);
      })
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("initializes with default values", () => {
      const filters = new RouteFilters();

      expect(filters.onChange).toBeNull();
      expect(filters.element).toBeNull();
      expect(filters.filters).toEqual({
        method: "all",
        framework: "all"
      });
      expect(filters.destroyed).toBe(false);
    });

    it("accepts a change callback", () => {
      const onChange = vi.fn();
      const filters = new RouteFilters({ onChange });

      expect(filters.onChange).toBe(onChange);
    });

    it("rejects an invalid callback", () => {
      expect(() => {
        new RouteFilters({
          onChange: "invalid"
        });
      }).toThrow(TypeError);
    });
  });

  describe("mount", () => {
    it("creates and mounts the filter element", () => {
      const filters = new RouteFilters();
      const container = createContainer();

      const element = filters.mount(container);

      expect(element).toBe(filters.element);
      expect(element.className).toBe("routelens-filters");
      expect(container.children).toContain(element);
    });

    it("returns the mounted element", () => {
      const filters = new RouteFilters();

      expect(filters.mount(createContainer())).toBe(
        filters.element
      );
    });

    it("creates both filter controls", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      expect(getSelect(filters, "method")).toBeDefined();
      expect(getSelect(filters, "framework")).toBeDefined();
    });

    it("removes the previous element when mounted again", () => {
      const filters = new RouteFilters();

      const firstContainer = createContainer();
      const secondContainer = createContainer();

      const firstElement = filters.mount(firstContainer);

      filters.mount(secondContainer);

      expect(firstElement.removed).toBe(true);
      expect(firstContainer.children).toHaveLength(0);
      expect(secondContainer.children).toContain(
        filters.element
      );
    });

    it("rejects an invalid container", () => {
      const filters = new RouteFilters();

      expect(() => filters.mount(null)).toThrow(TypeError);
      expect(() => filters.mount({})).toThrow(TypeError);
    });

    it("renders existing filter values when mounted", () => {
      const filters = new RouteFilters();

      filters.setFilter("method", "POST");
      filters.setFilter("framework", "express");

      filters.mount(createContainer());

      expect(getSelect(filters, "method").value).toBe("POST");
      expect(getSelect(filters, "framework").value).toBe(
        "express"
      );
    });
  });

  describe("rendering", () => {
    it("renders all supported HTTP methods", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      expect(
        getOptionValues(getSelect(filters, "method"))
      ).toEqual([
        "all",
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
        "HEAD"
      ]);
    });

    it("renders all supported frameworks", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      expect(
        getOptionValues(getSelect(filters, "framework"))
      ).toEqual([
        "all",
        "flask",
        "express",
        "laravel",
        "fastapi",
        "django",
        "nest"
      ]);
    });

    it("uses the correct default option labels", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      expect(
        getSelect(filters, "method").children[ 0 ].textContent
      ).toBe("All Methods");

      expect(
        getSelect(filters, "framework").children[ 0 ].textContent
      ).toBe("All Frameworks");
    });

    it("assigns the expected CSS classes", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      expect(filters.element.className).toBe(
        "routelens-filters"
      );

      expect(
        getSelect(filters, "method").className
      ).toBe("routelens-filter-select");
    });

    it("renders uppercase method labels", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      const options = getSelect(filters, "method").children;

      expect(options[ 1 ].textContent).toBe("GET");
      expect(options[ 2 ].textContent).toBe("POST");
    });

    it("renders uppercase framework labels", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      const options = getSelect(filters, "framework").children;

      expect(options[ 1 ].textContent).toBe("FLASK");
      expect(options[ 2 ].textContent).toBe("EXPRESS");
    });

    it("rejects rendering after destruction", () => {
      const filters = new RouteFilters();

      filters.destroy();

      expect(() => filters.render()).toThrow(
        "RouteFilters has been destroyed."
      );
    });
  });

  describe("createSelect", () => {
    it("creates a select wrapper", () => {
      const filters = new RouteFilters();

      const wrapper = filters.createSelect(
        "method"
      );

      expect(wrapper.tagName).toBe("LABEL");
      expect(wrapper.className).toBe("routelens-filter");
    });

    it("creates a select with the correct filter key", () => {
      const filters = new RouteFilters();

      const wrapper = filters.createSelect("method");
      const select = wrapper.children[ 0 ];

      expect(select.dataset.filter).toBe("method");
    });

    it("rejects unknown filter keys", () => {
      const filters = new RouteFilters();

      expect(() => {
        filters.createSelect("unknown");
      }).toThrow("Unknown route filter: unknown");
    });

    it("rejects creation after destruction", () => {
      const filters = new RouteFilters();

      filters.destroy();

      expect(() => {
        filters.createSelect("method");
      }).toThrow("RouteFilters has been destroyed.");
    });
  });

  describe("setFilter", () => {
    it("updates the method filter", () => {
      const filters = new RouteFilters();

      filters.setFilter("method", "POST");

      expect(filters.filters.method).toBe("POST");
    });

    it("updates the framework filter", () => {
      const filters = new RouteFilters();

      filters.setFilter("framework", "express");

      expect(filters.filters.framework).toBe("express");
    });

    it("normalizes method values to uppercase", () => {
      const filters = new RouteFilters();

      filters.setFilter("method", "post");

      expect(filters.filters.method).toBe("POST");
    });

    it("normalizes framework values to lowercase", () => {
      const filters = new RouteFilters();

      filters.setFilter("framework", "EXPRESS");

      expect(filters.filters.framework).toBe("express");
    });

    it("trims surrounding whitespace", () => {
      const filters = new RouteFilters();

      filters.setFilter("method", "  post  ");

      expect(filters.filters.method).toBe("POST");
    });

    it("accepts the all value", () => {
      const filters = new RouteFilters();

      filters.setFilter("method", "POST");
      filters.setFilter("method", "all");

      expect(filters.filters.method).toBe("all");
    });

    it("rejects unknown filter keys", () => {
      const filters = new RouteFilters();

      expect(() => {
        filters.setFilter("unknown", "value");
      }).toThrow("Unknown route filter: unknown");
    });

    it("rejects non-string values", () => {
      const filters = new RouteFilters();

      expect(() => {
        filters.setFilter("method", 123);
      }).toThrow(TypeError);

      expect(() => {
        filters.setFilter("framework", null);
      }).toThrow(TypeError);
    });

    it("rejects unsupported method values", () => {
      const filters = new RouteFilters();

      expect(() => {
        filters.setFilter("method", "CONNECT");
      }).toThrow(RangeError);
    });

    it("rejects unsupported framework values", () => {
      const filters = new RouteFilters();

      expect(() => {
        filters.setFilter("framework", "spring");
      }).toThrow(RangeError);
    });

    it("does not change state when validation fails", () => {
      const filters = new RouteFilters();

      expect(() => {
        filters.setFilter("method", "INVALID");
      }).toThrow(RangeError);

      expect(filters.filters.method).toBe("all");
    });

    it("updates the mounted select element", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());
      filters.setFilter("method", "DELETE");

      expect(getSelect(filters, "method").value).toBe(
        "DELETE"
      );
    });

    it("notifies the callback after updating a filter", () => {
      const onChange = vi.fn();
      const filters = new RouteFilters({ onChange });

      filters.setFilter("method", "PATCH");

      expect(onChange).toHaveBeenCalledWith({
        method: "PATCH",
        framework: "all"
      });
    });
  });

  describe("getValue", () => {
    it("returns the current filter values", () => {
      const filters = new RouteFilters();

      filters.setFilter("method", "POST");
      filters.setFilter("framework", "flask");

      expect(filters.getValue()).toEqual({
        method: "POST",
        framework: "flask"
      });
    });

    it("returns a copy instead of the internal object", () => {
      const filters = new RouteFilters();

      const value = filters.getValue();

      value.method = "DELETE";

      expect(filters.filters.method).toBe("all");
    });

    it("rejects access after destruction", () => {
      const filters = new RouteFilters();

      filters.destroy();

      expect(() => filters.getValue()).toThrow(
        "RouteFilters has been destroyed."
      );
    });
  });

  describe("change events", () => {
    it("updates the method filter when the select changes", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      const select = getSelect(filters, "method");

      select.value = "POST";
      select.dispatchEvent({ type: "change" });

      expect(filters.filters.method).toBe("POST");
    });

    it("updates the framework filter when the select changes", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      const select = getSelect(filters, "framework");

      select.value = "django";
      select.dispatchEvent({ type: "change" });

      expect(filters.filters.framework).toBe("django");
    });

    it("notifies the callback when a select changes", () => {
      const onChange = vi.fn();
      const filters = new RouteFilters({ onChange });

      filters.mount(createContainer());

      const select = getSelect(filters, "method");

      select.value = "GET";
      select.dispatchEvent({ type: "change" });

      expect(onChange).toHaveBeenCalledWith({
        method: "GET",
        framework: "all"
      });
    });

    it("does not notify when no callback exists", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      const select = getSelect(filters, "method");

      select.value = "POST";

      expect(() => {
        select.dispatchEvent({ type: "change" });
      }).not.toThrow();
    });

    it("does not process stale change events after destruction", () => {
      const onChange = vi.fn();
      const filters = new RouteFilters({ onChange });

      filters.mount(createContainer());

      const select = getSelect(filters, "method");

      filters.destroy();

      select.value = "POST";
      select.dispatchEvent({ type: "change" });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("restores all default values", () => {
      const filters = new RouteFilters();

      filters.setFilter("method", "POST");
      filters.setFilter("framework", "flask");

      filters.reset();

      expect(filters.filters).toEqual({
        method: "all",
        framework: "all"
      });
    });

    it("resets mounted select elements", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      filters.setFilter("method", "DELETE");
      filters.setFilter("framework", "django");

      filters.reset();

      expect(getSelect(filters, "method").value).toBe("all");
      expect(getSelect(filters, "framework").value).toBe(
        "all"
      );
    });

    it("notifies the callback after resetting", () => {
      const onChange = vi.fn();
      const filters = new RouteFilters({ onChange });

      filters.setFilter("method", "POST");
      onChange.mockClear();

      filters.reset();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        method: "all",
        framework: "all"
      });
    });

    it("works when the component is not mounted", () => {
      const filters = new RouteFilters();

      filters.setFilter("method", "POST");

      expect(() => filters.reset()).not.toThrow();
      expect(filters.filters.method).toBe("all");
    });
  });

  describe("notifyChange", () => {
    it("does nothing without a callback", () => {
      const filters = new RouteFilters();

      expect(() => filters.notifyChange()).not.toThrow();
    });

    it("does nothing after destruction", () => {
      const onChange = vi.fn();
      const filters = new RouteFilters({ onChange });

      filters.destroy();

      expect(() => filters.notifyChange()).not.toThrow();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("removes the mounted element", () => {
      const filters = new RouteFilters();
      const container = createContainer();

      const element = filters.mount(container);

      filters.destroy();

      expect(element.removed).toBe(true);
      expect(container.children).toHaveLength(0);
    });

    it("clears internal state", () => {
      const filters = new RouteFilters({
        onChange: vi.fn()
      });

      filters.mount(createContainer());
      filters.setFilter("method", "POST");

      filters.destroy();

      expect(filters.element).toBeNull();
      expect(filters.filters).toEqual({
        method: "all",
        framework: "all"
      });
      expect(filters.onChange).toBeNull();
      expect(filters.destroyed).toBe(true);
    });

    it("is safe to call multiple times", () => {
      const filters = new RouteFilters();

      filters.mount(createContainer());

      expect(() => {
        filters.destroy();
        filters.destroy();
      }).not.toThrow();
    });

    it("prevents operations after destruction", () => {
      const filters = new RouteFilters();

      filters.destroy();

      expect(() => filters.mount(createContainer())).toThrow(
        "RouteFilters has been destroyed."
      );

      expect(() => filters.render()).toThrow(
        "RouteFilters has been destroyed."
      );

      expect(() => filters.setFilter("method", "GET")).toThrow(
        "RouteFilters has been destroyed."
      );

      expect(() => filters.getValue()).toThrow(
        "RouteFilters has been destroyed."
      );

      expect(() => filters.reset()).toThrow(
        "RouteFilters has been destroyed."
      );
    });
  });
});
