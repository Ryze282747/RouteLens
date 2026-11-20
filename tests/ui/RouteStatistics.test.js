import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RouteStatistics from "../../src/ui/RouteStatistics.js";

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.children = [];
    this.parentElement = null;
    this._textContent = "";
  }

  appendChild(child) {
    if (child.parentElement) {
      child.remove();
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

  remove() {
    if (!this.parentElement) {
      return;
    }

    const index = this.parentElement.children.indexOf(this);

    if (index !== -1) {
      this.parentElement.children.splice(index, 1);
    }

    this.parentElement = null;
  }

  set textContent(value) {
    this.replaceChildren();
    this._textContent = String(value);
  }

  get textContent() {
    return (
      this._textContent +
      this.children.map((child) => child.textContent).join("")
    );
  }

  get innerHTML() {
    return "";
  }
}

function createContainer() {
  return new MockElement("div");
}

function findByClass(element, className) {
  if (!element || !Array.isArray(element.children)) {
    return null;
  }

  if (element.className === className) {
    return element;
  }

  for (const child of element.children) {
    const result = findByClass(child, className);

    if (result) {
      return result;
    }
  }

  return null;
}

function findAllByClass(element, className, results = []) {
  if (!element || !Array.isArray(element.children)) {
    return results;
  }

  if (element.className === className) {
    results.push(element);
  }

  for (const child of element.children) {
    findAllByClass(child, className, results);
  }

  return results;
}

describe("RouteStatistics", () => {
  let statistics;
  let container;

  beforeEach(() => {
    globalThis.document = {
      createElement: vi.fn((tagName) => new MockElement(tagName))
    };

    statistics = new RouteStatistics();
    container = createContainer();
  });

  afterEach(() => {
    statistics?.destroy();
    delete globalThis.document;
  });

  describe("constructor", () => {
    it("initializes with default statistics", () => {
      expect(statistics.getData()).toEqual({
        total: 0,
        visible: 0,
        frameworks: {},
        methods: {}
      });
    });

    it("starts without a mounted element", () => {
      expect(statistics.element).toBeNull();
    });

    it("starts active", () => {
      expect(statistics.destroyed).toBe(false);
    });
  });

  describe("mount", () => {
    it("mounts the statistics element", () => {
      const element = statistics.mount(container);

      expect(element).toBeInstanceOf(MockElement);
      expect(element.className).toBe("routelens-statistics");
      expect(container.children).toContain(element);
    });

    it("returns the mounted element", () => {
      expect(statistics.mount(container)).toBe(statistics.element);
    });

    it("renders default statistics when mounted", () => {
      statistics.mount(container);

      expect(statistics.element.textContent).toContain("Total Routes");
      expect(statistics.element.textContent).toContain("Visible Routes");
      expect(statistics.element.textContent).toContain("Frameworks");
      expect(statistics.element.textContent).toContain("HTTP Methods");
    });

    it("replaces the previous mounted element", () => {
      const first = statistics.mount(container);
      const second = statistics.mount(container);

      expect(first.parentElement).toBeNull();
      expect(second).not.toBe(first);
      expect(container.children).toEqual([ second ]);
    });

    it("supports mounting into another container", () => {
      const firstContainer = createContainer();
      const secondContainer = createContainer();

      statistics.mount(firstContainer);
      const element = statistics.mount(secondContainer);

      expect(firstContainer.children).toHaveLength(0);
      expect(secondContainer.children).toEqual([ element ]);
    });

    it("rejects an invalid container", () => {
      expect(() => statistics.mount(null)).toThrow(TypeError);
      expect(() => statistics.mount({})).toThrow(TypeError);
    });

    it("rejects mounting after destruction", () => {
      statistics.destroy();

      expect(() => statistics.mount(container)).toThrow(
        "RouteStatistics has been destroyed."
      );
    });
  });

  describe("setData", () => {
    it("updates total and visible route counts", () => {
      statistics.setData({
        total: 20,
        visible: 12
      });

      expect(statistics.getData()).toEqual({
        total: 20,
        visible: 12,
        frameworks: {},
        methods: {}
      });
    });

    it("updates framework and method distributions", () => {
      statistics.setData({
        frameworks: {
          Flask: 5,
          Express: 3
        },
        methods: {
          GET: 6,
          POST: 2
        }
      });

      expect(statistics.getData().frameworks).toEqual({
        Flask: 5,
        Express: 3
      });

      expect(statistics.getData().methods).toEqual({
        GET: 6,
        POST: 2
      });
    });

    it("updates all statistics together", () => {
      statistics.setData({
        total: 15,
        visible: 10,
        frameworks: {
          Flask: 8,
          Express: 7
        },
        methods: {
          GET: 9,
          POST: 6
        }
      });

      expect(statistics.getData()).toEqual({
        total: 15,
        visible: 10,
        frameworks: {
          Flask: 8,
          Express: 7
        },
        methods: {
          GET: 9,
          POST: 6
        }
      });
    });

    it("renders updated data when mounted", () => {
      statistics.mount(container);

      statistics.setData({
        total: 25,
        visible: 18
      });

      expect(statistics.element.textContent).toContain("25");
      expect(statistics.element.textContent).toContain("18");
    });

    it("does not require mounting before updating data", () => {
      expect(() => {
        statistics.setData({
          total: 5,
          visible: 3
        });
      }).not.toThrow();

      expect(statistics.getData().total).toBe(5);
    });

    it("resets omitted fields to their defaults", () => {
      statistics.setData({
        total: 10,
        visible: 8,
        frameworks: {
          Flask: 10
        },
        methods: {
          GET: 10
        }
      });

      statistics.setData({
        total: 2
      });

      expect(statistics.getData()).toEqual({
        total: 2,
        visible: 0,
        frameworks: {},
        methods: {}
      });
    });

    it("rejects null data", () => {
      expect(() => statistics.setData(null)).toThrow(TypeError);
    });

    it("rejects array data", () => {
      expect(() => statistics.setData([])).toThrow(TypeError);
    });

    it("rejects primitive data", () => {
      expect(() => statistics.setData(10)).toThrow(TypeError);
      expect(() => statistics.setData("invalid")).toThrow(TypeError);
    });

    it("rejects updates after destruction", () => {
      statistics.destroy();

      expect(() => statistics.setData({ total: 1 })).toThrow(
        "RouteStatistics has been destroyed."
      );
    });
  });

  describe("count normalization", () => {
    it("normalizes negative counts to zero", () => {
      statistics.setData({
        total: -5,
        visible: -2
      });

      expect(statistics.getData().total).toBe(0);
      expect(statistics.getData().visible).toBe(0);
    });

    it("normalizes non-finite counts to zero", () => {
      statistics.setData({
        total: Infinity,
        visible: NaN
      });

      expect(statistics.getData().total).toBe(0);
      expect(statistics.getData().visible).toBe(0);
    });

    it("normalizes non-number counts to zero", () => {
      statistics.setData({
        total: "10",
        visible: null
      });

      expect(statistics.getData().total).toBe(0);
      expect(statistics.getData().visible).toBe(0);
    });

    it("floors decimal counts", () => {
      statistics.setData({
        total: 10.9,
        visible: 4.7
      });

      expect(statistics.getData().total).toBe(10);
      expect(statistics.getData().visible).toBe(4);
    });

    it("preserves zero counts", () => {
      statistics.setData({
        total: 0,
        visible: 0
      });

      expect(statistics.getData().total).toBe(0);
      expect(statistics.getData().visible).toBe(0);
    });
  });

  describe("distribution normalization", () => {
    it("ignores invalid distribution values", () => {
      statistics.setData({
        frameworks: null,
        methods: []
      });

      expect(statistics.getData().frameworks).toEqual({});
      expect(statistics.getData().methods).toEqual({});
    });

    it("trims distribution names", () => {
      statistics.setData({
        frameworks: {
          " Flask ": 4,
          " Express ": 2
        }
      });

      expect(statistics.getData().frameworks).toEqual({
        Flask: 4,
        Express: 2
      });
    });

    it("ignores empty distribution names", () => {
      statistics.setData({
        frameworks: {
          "": 5,
          "   ": 3,
          Flask: 2
        }
      });

      expect(statistics.getData().frameworks).toEqual({
        Flask: 2
      });
    });

    it("normalizes invalid distribution counts", () => {
      statistics.setData({
        methods: {
          GET: 5,
          POST: -2,
          PUT: "invalid",
          DELETE: Infinity
        }
      });

      expect(statistics.getData().methods).toEqual({
        GET: 5,
        POST: 0,
        PUT: 0,
        DELETE: 0
      });
    });

    it("does not retain the original distribution object", () => {
      const frameworks = {
        Flask: 5
      };

      statistics.setData({ frameworks });

      frameworks.Flask = 100;
      frameworks.Express = 50;

      expect(statistics.getData().frameworks).toEqual({
        Flask: 5
      });
    });
  });

  describe("getData", () => {
    it("returns a copy of the statistics data", () => {
      statistics.setData({
        total: 10,
        visible: 5,
        frameworks: {
          Flask: 10
        },
        methods: {
          GET: 5
        }
      });

      const result = statistics.getData();

      result.total = 999;
      result.frameworks.Flask = 999;
      result.methods.GET = 999;

      expect(statistics.getData()).toEqual({
        total: 10,
        visible: 5,
        frameworks: {
          Flask: 10
        },
        methods: {
          GET: 5
        }
      });
    });

    it("rejects access after destruction", () => {
      statistics.destroy();

      expect(() => statistics.getData()).toThrow(
        "RouteStatistics has been destroyed."
      );
    });
  });

  describe("render", () => {
    it("does nothing when no element is mounted", () => {
      expect(() => statistics.render()).not.toThrow();
    });

    it("renders four overview cards", () => {
      statistics.mount(container);

      const cards = findAllByClass(
        statistics.element,
        "routelens-stat-card"
      );

      expect(cards).toHaveLength(4);
    });

    it("renders the correct overview card values", () => {
      statistics.setData({
        total: 20,
        visible: 12,
        frameworks: {
          Flask: 10,
          Express: 10
        },
        methods: {
          GET: 8,
          POST: 4
        }
      });

      statistics.mount(container);

      const cards = findAllByClass(
        statistics.element,
        "routelens-stat-card"
      );

      expect(cards[ 0 ].textContent).toContain("20");
      expect(cards[ 1 ].textContent).toContain("12");
      expect(cards[ 2 ].textContent).toContain("2");
      expect(cards[ 3 ].textContent).toContain("2");
    });

    it("renders framework distribution", () => {
      statistics.setData({
        frameworks: {
          Flask: 5,
          Express: 3
        }
      });

      statistics.mount(container);

      expect(statistics.element.textContent).toContain(
        "Framework Distribution"
      );

      expect(statistics.element.textContent).toContain("Flask");
      expect(statistics.element.textContent).toContain("Express");
    });

    it("renders HTTP method distribution", () => {
      statistics.setData({
        methods: {
          GET: 5,
          POST: 3
        }
      });

      statistics.mount(container);

      expect(statistics.element.textContent).toContain(
        "HTTP Method Distribution"
      );

      expect(statistics.element.textContent).toContain("GET");
      expect(statistics.element.textContent).toContain("POST");
    });

    it("sorts distribution entries by descending count", () => {
      statistics.setData({
        frameworks: {
          Flask: 2,
          Express: 8,
          Laravel: 5
        }
      });

      statistics.mount(container);

      const section = findAllByClass(
        statistics.element,
        "routelens-stat-breakdown"
      )[ 0 ];

      const rows = findAllByClass(
        section,
        "routelens-stat-breakdown-row"
      );

      expect(rows.map((row) => row.textContent)).toEqual([
        "Express8",
        "Laravel5",
        "Flask2"
      ]);
    });

    it("sorts equal counts alphabetically", () => {
      statistics.setData({
        frameworks: {
          Laravel: 5,
          Express: 5,
          Flask: 5
        }
      });

      statistics.mount(container);

      const section = findAllByClass(
        statistics.element,
        "routelens-stat-breakdown"
      )[ 0 ];

      const rows = findAllByClass(
        section,
        "routelens-stat-breakdown-row"
      );

      expect(rows.map((row) => row.textContent)).toEqual([
        "Express5",
        "Flask5",
        "Laravel5"
      ]);
    });

    it("does not render empty breakdown sections", () => {
      statistics.mount(container);

      expect(
        findAllByClass(
          statistics.element,
          "routelens-stat-breakdown"
        )
      ).toHaveLength(0);
    });

    it("updates existing rendered content", () => {
      statistics.mount(container);

      statistics.setData({
        total: 50,
        visible: 25,
        frameworks: {
          Flask: 50
        }
      });

      expect(statistics.element.textContent).toContain("50");
      expect(statistics.element.textContent).toContain("25");
      expect(statistics.element.textContent).toContain("Flask");
    });

    it("removes old breakdowns when data is replaced", () => {
      statistics.mount(container);

      statistics.setData({
        frameworks: {
          Flask: 5
        }
      });

      statistics.setData({
        methods: {
          GET: 3
        }
      });

      expect(statistics.element.textContent).not.toContain("Flask");
      expect(statistics.element.textContent).toContain("GET");
    });

    it("rejects rendering after destruction", () => {
      statistics.destroy();

      expect(() => statistics.render()).toThrow(
        "RouteStatistics has been destroyed."
      );
    });
  });

  describe("createCard", () => {
    it("creates a statistic card", () => {
      const card = statistics.createCard(
        "Total Routes",
        10,
        "Discovered in project"
      );

      expect(card.className).toBe("routelens-stat-card");
      expect(card.textContent).toContain("Total Routes");
      expect(card.textContent).toContain("10");
      expect(card.textContent).toContain("Discovered in project");
    });

    it("converts card values to strings", () => {
      const card = statistics.createCard(
        123,
        456,
        true
      );

      expect(card.textContent).toContain("123");
      expect(card.textContent).toContain("456");
      expect(card.textContent).toContain("true");
    });

    it("rejects card creation after destruction", () => {
      statistics.destroy();

      expect(() => {
        statistics.createCard("Title", 1, "Description");
      }).toThrow("RouteStatistics has been destroyed.");
    });
  });

  describe("destroy", () => {
    it("removes the mounted element", () => {
      statistics.mount(container);

      const element = statistics.element;

      statistics.destroy();

      expect(element.parentElement).toBeNull();
      expect(container.children).toHaveLength(0);
    });

    it("clears the element reference", () => {
      statistics.mount(container);
      statistics.destroy();

      expect(statistics.element).toBeNull();
    });

    it("resets statistics data", () => {
      statistics.setData({
        total: 10,
        visible: 5,
        frameworks: {
          Flask: 10
        },
        methods: {
          GET: 5
        }
      });

      statistics.destroy();

      expect(statistics.data).toEqual({
        total: 0,
        visible: 0,
        frameworks: {},
        methods: {}
      });
    });

    it("marks the instance as destroyed", () => {
      statistics.destroy();

      expect(statistics.destroyed).toBe(true);
    });

    it("is safe to call multiple times", () => {
      statistics.mount(container);

      expect(() => {
        statistics.destroy();
        statistics.destroy();
      }).not.toThrow();
    });
  });

  describe("lifecycle", () => {
    it("does not allow remounting after destruction", () => {
      statistics.mount(container);
      statistics.destroy();

      expect(() => statistics.mount(container)).toThrow(
        "RouteStatistics has been destroyed."
      );
    });

    it("does not allow data updates after destruction", () => {
      statistics.destroy();

      expect(() => {
        statistics.setData({ total: 5 });
      }).toThrow("RouteStatistics has been destroyed.");
    });

    it("does not allow rendering after destruction", () => {
      statistics.destroy();

      expect(() => statistics.render()).toThrow(
        "RouteStatistics has been destroyed."
      );
    });
  });
});