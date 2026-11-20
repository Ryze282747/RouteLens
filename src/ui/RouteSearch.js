export default class RouteSearch {
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
    this.input = null;
    this.query = "";

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

    element.className = "routelens-search";

    const input = document.createElement("input");

    input.type = "search";
    input.className = "routelens-search-input";
    input.placeholder = "Search routes, handlers, files...";
    input.setAttribute(
      "aria-label",
      "Search API routes"
    );

    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = this.query;

    input.addEventListener("input", () => {
      if (
        this.destroyed ||
        this.input !== input
      ) {
        return;
      }

      this.query = input.value.trim();

      this.notifyChange();
    });

    element.appendChild(input);

    this.element?.remove();

    this.element = element;
    this.input = input;

    container.appendChild(element);

    return element;
  }

  setValue(value) {
    this.ensureActive();

    this.query = typeof value === "string"
      ? value.trim()
      : "";

    if (this.input) {
      this.input.value = this.query;
    }

    this.notifyChange();
  }

  getValue() {
    this.ensureActive();

    return this.query;
  }

  clear() {
    this.ensureActive();

    this.setValue("");
  }

  focus() {
    this.ensureActive();

    this.input?.focus();
  }

  notifyChange() {
    if (
      this.destroyed ||
      typeof this.onChange !== "function"
    ) {
      return;
    }

    this.onChange(this.query);
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "RouteSearch has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.element?.remove();

    this.element = null;
    this.input = null;
    this.query = "";

    this.onChange = null;
    this.destroyed = true;
  }
}
