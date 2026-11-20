const DEFAULT_DATA = Object.freeze({
  total: 0,
  visible: 0,
  frameworks: {},
  methods: {}
});

export default class RouteStatistics {
  constructor() {
    this.element = null;
    this.data = this.createDefaultData();

    this.destroyed = false;
  }

  mount(container) {
    this.ensureActive();

    if (
      !container ||
      typeof container.appendChild !== "function"
    ) {
      throw new TypeError(
        "A valid container element is required."
      );
    }

    const element = document.createElement("div");

    element.className = "routelens-statistics";

    this.element?.remove();
    this.element = element;

    container.appendChild(element);

    this.render();

    return this.element;
  }

  setData(data = {}) {
    this.ensureActive();

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      throw new TypeError(
        "Statistics data must be an object."
      );
    }

    this.data = {
      total: this.normalizeCount(data.total),
      visible: this.normalizeCount(data.visible),
      frameworks: this.normalizeCounts(data.frameworks),
      methods: this.normalizeCounts(data.methods)
    };

    this.render();
  }

  getData() {
    this.ensureActive();

    return {
      total: this.data.total,
      visible: this.data.visible,
      frameworks: { ...this.data.frameworks },
      methods: { ...this.data.methods }
    };
  }

  render() {
    this.ensureActive();

    if (!this.element) {
      return;
    }

    this.element.replaceChildren();

    const overview = document.createElement("div");

    overview.className = "routelens-statistics-overview";

    overview.append(
      this.createCard(
        "Total Routes",
        this.data.total,
        "Discovered in project"
      ),
      this.createCard(
        "Visible Routes",
        this.data.visible,
        "After applying filters"
      ),
      this.createCard(
        "Frameworks",
        Object.keys(this.data.frameworks).length,
        "Detected frameworks"
      ),
      this.createCard(
        "HTTP Methods",
        Object.keys(this.data.methods).length,
        "Methods discovered"
      )
    );

    this.element.appendChild(overview);

    this.renderBreakdown(
      "Framework Distribution",
      this.data.frameworks
    );

    this.renderBreakdown(
      "HTTP Method Distribution",
      this.data.methods
    );
  }

  createCard(title, value, description) {
    this.ensureActive();

    const card = document.createElement("article");

    card.className = "routelens-stat-card";

    const heading = document.createElement("span");

    heading.className = "routelens-stat-title";
    heading.textContent = String(title);

    const number = document.createElement("strong");

    number.className = "routelens-stat-value";
    number.textContent = String(value);

    const detail = document.createElement("span");

    detail.className = "routelens-stat-description";
    detail.textContent = String(description);

    card.append(heading, number, detail);

    return card;
  }

  renderBreakdown(title, counts) {
    this.ensureActive();

    const entries = Object.entries(counts)
      .sort((first, second) => {
        const countDifference = second[ 1 ] - first[ 1 ];

        if (countDifference !== 0) {
          return countDifference;
        }

        return first[ 0 ].localeCompare(second[ 0 ]);
      });

    if (entries.length === 0) {
      return;
    }

    const section = document.createElement("section");

    section.className = "routelens-stat-breakdown";

    const heading = document.createElement("h4");

    heading.textContent = title;

    const list = document.createElement("div");

    list.className = "routelens-stat-breakdown-list";

    for (const [ name, count ] of entries) {
      const row = document.createElement("div");

      row.className = "routelens-stat-breakdown-row";

      const label = document.createElement("span");

      label.textContent = name;

      const value = document.createElement("strong");

      value.textContent = String(count);

      row.append(label, value);
      list.appendChild(row);
    }

    section.append(heading, list);

    this.element.appendChild(section);
  }

  normalizeCount(value) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      return 0;
    }

    return Math.floor(value);
  }

  normalizeCounts(counts) {
    if (
      !counts ||
      typeof counts !== "object" ||
      Array.isArray(counts)
    ) {
      return {};
    }

    const normalized = {};

    for (const [ key, value ] of Object.entries(counts)) {
      const normalizedKey = key.trim();

      if (!normalizedKey) {
        continue;
      }

      normalized[ normalizedKey ] = this.normalizeCount(value);
    }

    return normalized;
  }

  createDefaultData() {
    return {
      total: DEFAULT_DATA.total,
      visible: DEFAULT_DATA.visible,
      frameworks: {},
      methods: {}
    };
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "RouteStatistics has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.element?.remove();

    this.element = null;
    this.data = this.createDefaultData();

    this.destroyed = true;
  }
}
