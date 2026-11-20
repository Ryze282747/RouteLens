const FILTER_OPTIONS = Object.freeze({
  method: Object.freeze([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
    "HEAD"
  ]),
  framework: Object.freeze([
    "flask",
    "express",
    "laravel",
    "fastapi",
    "django",
    "nest"
  ])
});

const DEFAULT_FILTERS = Object.freeze({
  method: "all",
  framework: "all"
});

const FILTER_LABELS = Object.freeze({
  method: "All Methods",
  framework: "All Frameworks"
});

export default class RouteFilters {
  constructor({ onChange = null } = {}) {
    if (
      onChange !== null &&
      typeof onChange !== "function"
    ) {
      throw new TypeError(
        "onChange must be a function or null."
      );
    }

    this.onChange = onChange;

    this.element = null;
    this.filters = { ...DEFAULT_FILTERS };

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

    element.className = "routelens-filters";

    this.element?.remove();
    this.element = element;

    container.appendChild(element);

    this.render();

    return this.element;
  }

  render() {
    this.ensureActive();

    if (!this.element) {
      return;
    }

    this.element.replaceChildren();

    for (const key of Object.keys(FILTER_OPTIONS)) {
      const select = this.createSelect(key);

      this.element.appendChild(select);
    }
  }

  createSelect(key) {
    this.ensureActive();

    if (!Object.prototype.hasOwnProperty.call(
      FILTER_OPTIONS,
      key
    )) {
      throw new Error(`Unknown route filter: ${key}`);
    }

    const wrapper = document.createElement("label");

    wrapper.className = "routelens-filter";

    const select = document.createElement("select");

    select.className = "routelens-filter-select";
    select.dataset.filter = key;

    const defaultOption = document.createElement("option");

    defaultOption.value = "all";
    defaultOption.textContent = FILTER_LABELS[ key ];

    select.appendChild(defaultOption);

    for (const value of FILTER_OPTIONS[ key ]) {
      const option = document.createElement("option");

      option.value = value;
      option.textContent = value.toUpperCase();

      select.appendChild(option);
    }

    select.value = this.filters[ key ];

    select.addEventListener("change", () => {
      if (this.destroyed) {
        return;
      }

      this.setFilter(key, select.value);
    });

    wrapper.appendChild(select);

    return wrapper;
  }

  setFilter(key, value) {
    this.ensureActive();

    if (!Object.prototype.hasOwnProperty.call(
      FILTER_OPTIONS,
      key
    )) {
      throw new Error(`Unknown route filter: ${key}`);
    }

    const normalizedValue = this.normalizeFilterValue(
      key,
      value
    );

    this.filters[ key ] = normalizedValue;

    if (this.element) {
      const select = this.element.querySelector(
        `[data-filter="${key}"]`
      );

      if (select) {
        select.value = normalizedValue;
      }
    }

    this.notifyChange();
  }

  normalizeFilterValue(key, value) {
    if (typeof value !== "string") {
      throw new TypeError(
        `The ${key} filter value must be a string.`
      );
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === "all") {
      return "all";
    }

    const match = FILTER_OPTIONS[ key ].find(
      (option) => option.toLowerCase() === normalized
    );

    if (!match) {
      throw new RangeError(
        `Unsupported ${key} filter value: ${value}`
      );
    }

    return match;
  }

  getValue() {
    this.ensureActive();

    return { ...this.filters };
  }

  reset() {
    this.ensureActive();

    this.filters = { ...DEFAULT_FILTERS };

    if (this.element) {
      for (const key of Object.keys(FILTER_OPTIONS)) {
        const select = this.element.querySelector(
          `[data-filter="${key}"]`
        );

        if (select) {
          select.value = "all";
        }
      }
    }

    this.notifyChange();
  }

  notifyChange() {
    if (
      this.destroyed ||
      typeof this.onChange !== "function"
    ) {
      return;
    }

    this.onChange(this.getValue());
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "RouteFilters has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.element?.remove();

    this.element = null;
    this.filters = { ...DEFAULT_FILTERS };
    this.onChange = null;

    this.destroyed = true;
  }
}
