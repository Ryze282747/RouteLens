import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteSearch from "../../src/ui/RouteSearch.js";

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.listeners = {};
    this.value = "";
    this.type = "";
    this.placeholder = "";
    this.autocomplete = "";
    this.spellcheck = true;
    this.focused = false;
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

  setAttribute(name, value) {
    this.attributes[ name ] = String(value);
  }

  getAttribute(name) {
    return this.attributes[ name ] ?? null;
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

  focus() {
    this.focused = true;
  }
}

function createContainer() {
  return new MockElement("div");
}

describe("RouteSearch", () => {
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
      const search = new RouteSearch();

      expect(search.onChange).toBeNull();
      expect(search.element).toBeNull();
      expect(search.input).toBeNull();
      expect(search.query).toBe("");
      expect(search.destroyed).toBe(false);
    });

    it("accepts a change callback", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      expect(search.onChange).toBe(onChange);
    });

    it("rejects an invalid callback", () => {
      expect(() => {
        new RouteSearch({
          onChange: "invalid"
        });
      }).toThrow(TypeError);
    });
  });

  describe("mount", () => {
    it("creates and mounts the search element", () => {
      const search = new RouteSearch();
      const container = createContainer();

      const element = search.mount(container);

      expect(element).toBe(search.element);
      expect(element.className).toBe("routelens-search");
      expect(container.children).toContain(element);
    });

    it("returns the mounted element", () => {
      const search = new RouteSearch();

      expect(search.mount(createContainer())).toBe(
        search.element
      );
    });

    it("creates a search input", () => {
      const search = new RouteSearch();

      search.mount(createContainer());

      expect(search.input.tagName).toBe("INPUT");
      expect(search.input.type).toBe("search");
    });

    it("assigns the expected input class", () => {
      const search = new RouteSearch();

      search.mount(createContainer());

      expect(search.input.className).toBe(
        "routelens-search-input"
      );
    });

    it("sets the search placeholder", () => {
      const search = new RouteSearch();

      search.mount(createContainer());

      expect(search.input.placeholder).toBe(
        "Search routes, handlers, files..."
      );
    });

    it("sets the accessible label", () => {
      const search = new RouteSearch();

      search.mount(createContainer());

      expect(
        search.input.getAttribute("aria-label")
      ).toBe("Search API routes");
    });

    it("disables autocomplete and spellchecking", () => {
      const search = new RouteSearch();

      search.mount(createContainer());

      expect(search.input.autocomplete).toBe("off");
      expect(search.input.spellcheck).toBe(false);
    });

    it("preserves the current query when mounted", () => {
      const search = new RouteSearch();

      search.setValue("users");

      search.mount(createContainer());

      expect(search.input.value).toBe("users");
    });

    it("removes the previous element when mounted again", () => {
      const search = new RouteSearch();

      const firstContainer = createContainer();
      const secondContainer = createContainer();

      const firstElement = search.mount(firstContainer);

      search.mount(secondContainer);

      expect(firstElement.removed).toBe(true);
      expect(firstContainer.children).toHaveLength(0);
      expect(secondContainer.children).toContain(
        search.element
      );
    });

    it("rejects an invalid container", () => {
      const search = new RouteSearch();

      expect(() => search.mount(null)).toThrow(TypeError);
      expect(() => search.mount({})).toThrow(TypeError);
    });

    it("does not remove the existing element when container validation fails", () => {
      const search = new RouteSearch();
      const container = createContainer();

      const original = search.mount(container);

      expect(() => search.mount(null)).toThrow(TypeError);

      expect(search.element).toBe(original);
      expect(original.removed).toBe(false);
    });
  });

  describe("input events", () => {
    it("updates the query when the user types", () => {
      const search = new RouteSearch();

      search.mount(createContainer());

      search.input.value = "users";
      search.input.dispatchEvent({ type: "input" });

      expect(search.query).toBe("users");
    });

    it("trims surrounding whitespace from input", () => {
      const search = new RouteSearch();

      search.mount(createContainer());

      search.input.value = "  users  ";
      search.input.dispatchEvent({ type: "input" });

      expect(search.query).toBe("users");
    });

    it("notifies the callback when input changes", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.mount(createContainer());

      search.input.value = "users";
      search.input.dispatchEvent({ type: "input" });

      expect(onChange).toHaveBeenCalledWith("users");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("notifies with an empty string when input is cleared", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.mount(createContainer());

      search.input.value = "";
      search.input.dispatchEvent({ type: "input" });

      expect(search.query).toBe("");
      expect(onChange).toHaveBeenCalledWith("");
    });

    it("does not notify when no callback exists", () => {
      const search = new RouteSearch();

      search.mount(createContainer());
      search.input.value = "users";

      expect(() => {
        search.input.dispatchEvent({ type: "input" });
      }).not.toThrow();
    });

    it("ignores events from a previously mounted input", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.mount(createContainer());

      const oldInput = search.input;

      search.mount(createContainer());

      oldInput.value = "stale";
      oldInput.dispatchEvent({ type: "input" });

      expect(search.query).toBe("");
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("setValue", () => {
    it("sets the search query", () => {
      const search = new RouteSearch();

      search.setValue("users");

      expect(search.query).toBe("users");
    });

    it("trims surrounding whitespace", () => {
      const search = new RouteSearch();

      search.setValue("  users  ");

      expect(search.query).toBe("users");
    });

    it("converts non-string values to an empty query", () => {
      const search = new RouteSearch();

      search.setValue(123);

      expect(search.query).toBe("");
    });

    it("converts null to an empty query", () => {
      const search = new RouteSearch();

      search.setValue(null);

      expect(search.query).toBe("");
    });

    it("updates the mounted input value", () => {
      const search = new RouteSearch();

      search.mount(createContainer());
      search.setValue("products");

      expect(search.input.value).toBe("products");
    });

    it("notifies the callback", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.setValue("users");

      expect(onChange).toHaveBeenCalledWith("users");
    });

    it("notifies after setting an empty value", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.setValue("users");
      onChange.mockClear();

      search.setValue("");

      expect(onChange).toHaveBeenCalledWith("");
    });
  });

  describe("getValue", () => {
    it("returns the current query", () => {
      const search = new RouteSearch();

      search.setValue("users");

      expect(search.getValue()).toBe("users");
    });

    it("returns an empty string by default", () => {
      const search = new RouteSearch();

      expect(search.getValue()).toBe("");
    });
  });

  describe("clear", () => {
    it("clears the current query", () => {
      const search = new RouteSearch();

      search.setValue("users");
      search.clear();

      expect(search.query).toBe("");
    });

    it("clears the mounted input", () => {
      const search = new RouteSearch();

      search.mount(createContainer());
      search.setValue("users");
      search.clear();

      expect(search.input.value).toBe("");
    });

    it("notifies the callback", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.setValue("users");
      onChange.mockClear();

      search.clear();

      expect(onChange).toHaveBeenCalledWith("");
    });
  });

  describe("focus", () => {
    it("focuses the mounted input", () => {
      const search = new RouteSearch();

      search.mount(createContainer());
      search.focus();

      expect(search.input.focused).toBe(true);
    });

    it("does not throw when the component is not mounted", () => {
      const search = new RouteSearch();

      expect(() => search.focus()).not.toThrow();
    });
  });

  describe("notifyChange", () => {
    it("does nothing without a callback", () => {
      const search = new RouteSearch();

      expect(() => search.notifyChange()).not.toThrow();
    });

    it("passes the current query to the callback", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.query = "users";
      search.notifyChange();

      expect(onChange).toHaveBeenCalledWith("users");
    });

    it("does nothing after destruction", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.destroy();

      expect(() => search.notifyChange()).not.toThrow();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("removes the mounted element", () => {
      const search = new RouteSearch();
      const container = createContainer();

      const element = search.mount(container);

      search.destroy();

      expect(element.removed).toBe(true);
      expect(container.children).toHaveLength(0);
    });

    it("clears internal state", () => {
      const search = new RouteSearch({
        onChange: vi.fn()
      });

      search.mount(createContainer());
      search.setValue("users");

      search.destroy();

      expect(search.element).toBeNull();
      expect(search.input).toBeNull();
      expect(search.query).toBe("");
      expect(search.onChange).toBeNull();
      expect(search.destroyed).toBe(true);
    });

    it("is safe to call multiple times", () => {
      const search = new RouteSearch();

      search.mount(createContainer());

      expect(() => {
        search.destroy();
        search.destroy();
      }).not.toThrow();
    });

    it("prevents stale input events after destruction", () => {
      const onChange = vi.fn();
      const search = new RouteSearch({ onChange });

      search.mount(createContainer());

      const oldInput = search.input;

      search.destroy();

      oldInput.value = "users";
      oldInput.dispatchEvent({ type: "input" });

      expect(onChange).not.toHaveBeenCalled();
    });

    it("prevents operations after destruction", () => {
      const search = new RouteSearch();

      search.destroy();

      expect(() => search.mount(createContainer())).toThrow(
        "RouteSearch has been destroyed."
      );

      expect(() => search.setValue("users")).toThrow(
        "RouteSearch has been destroyed."
      );

      expect(() => search.getValue()).toThrow(
        "RouteSearch has been destroyed."
      );

      expect(() => search.clear()).toThrow(
        "RouteSearch has been destroyed."
      );

      expect(() => search.focus()).toThrow(
        "RouteSearch has been destroyed."
      );
    });
  });
});
