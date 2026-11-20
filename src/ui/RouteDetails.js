export default class RouteDetails {
  constructor({ onNavigate = null } = {}) {
    this.onNavigate = onNavigate;

    this.element = null;
    this.route = null;
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

    element.className = "routelens-route-details";

    container.appendChild(element);

    this.element?.remove();
    this.element = element;

    this.render();

    return this.element;
  }

  setRoute(route) {
    this.ensureActive();

    if (
      route !== null &&
      (
        typeof route !== "object" ||
        Array.isArray(route)
      )
    ) {
      throw new TypeError(
        "Route details must be an object or null."
      );
    }

    this.route = route;

    this.render();
  }

  render() {
    this.ensureActive();

    if (!this.element) {
      return;
    }

    this.element.replaceChildren();

    if (!this.route) {
      this.renderEmptyState();
      return;
    }

    this.renderHeader();
    this.renderProperties();
    this.renderMetadata();
    this.renderActions();
  }

  renderEmptyState() {
    const empty = document.createElement("div");

    empty.className = "routelens-details-empty";

    const title = document.createElement("h3");

    title.textContent = "Route Details";

    const description = document.createElement("p");

    description.textContent =
      "Select a route to inspect its information.";

    empty.append(title, description);

    this.element.appendChild(empty);
  }

  renderHeader() {
    const header = document.createElement("div");

    header.className = "routelens-details-header";

    const title = document.createElement("h3");

    title.textContent = "Route Details";

    const path = document.createElement("div");

    path.className = "routelens-details-path";

    path.textContent = this.toDisplayString(
      this.route.path,
      "/"
    );

    const methods = document.createElement("div");

    methods.className = "routelens-details-methods";

    const routeMethods = Array.isArray(this.route.methods)
      ? this.route.methods
      : [];

    for (const method of routeMethods) {
      if (
        typeof method !== "string" ||
        method.trim().length === 0
      ) {
        continue;
      }

      const normalizedMethod = method
        .trim()
        .toLowerCase();

      const safeMethodClass = normalizedMethod.replace(
        /[^a-z0-9_-]/g,
        "-"
      );

      const badge = document.createElement("span");

      badge.className =
        `routelens-method-badge method-${safeMethodClass}`;

      badge.textContent = method.trim();

      methods.appendChild(badge);
    }

    header.append(title, path, methods);

    this.element.appendChild(header);
  }

  renderProperties() {
    const properties = [
      [ "Framework", this.route.framework ],
      [ "Handler", this.route.handler ],
      [ "Controller", this.route.controller ],
      [ "Blueprint", this.route.blueprint ],
      [ "Router", this.route.router ],
      [ "Prefix", this.route.prefix ]
    ];

    const hasProperties = properties.some(([ , value ]) => {
      return this.hasDisplayValue(value);
    });

    if (!hasProperties) {
      return;
    }

    const section = this.createSection(
      "Route Information"
    );

    for (const [ label, value ] of properties) {
      this.addProperty(section, label, value);
    }

    this.element.appendChild(section);
  }

  renderMetadata() {
    const source = this.createSection(
      "Source Location"
    );

    this.addProperty(
      source,
      "File",
      this.route.file
    );

    this.addProperty(
      source,
      "Line",
      this.route.line
    );

    if (source.children.length > 1) {
      this.element.appendChild(source);
    }

    const metadata = this.route.metadata;

    if (
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata)
    ) {
      const entries = Object.entries(metadata);

      if (entries.length > 0) {
        const metadataSection = this.createSection(
          "Additional Metadata"
        );

        for (const [ key, value ] of entries) {
          this.addProperty(
            metadataSection,
            this.formatLabel(key),
            this.formatValue(value)
          );
        }

        this.element.appendChild(metadataSection);
      }
    }

    if (this.hasDisplayValue(this.route.source)) {
      this.renderSourceDeclaration();
    }
  }

  renderSourceDeclaration() {
    const declarationSection = this.createSection(
      "Route Declaration"
    );

    const code = document.createElement("pre");

    code.className = "routelens-source-code";

    const codeElement = document.createElement("code");

    codeElement.textContent = this.formatSource(
      this.route.source
    );

    code.appendChild(codeElement);

    declarationSection.appendChild(code);

    this.element.appendChild(declarationSection);
  }

  formatSource(source) {
    if (typeof source === "string") {
      return source;
    }

    if (
      source === null ||
      source === undefined
    ) {
      return "";
    }

    if (
      typeof source === "object" &&
      !Array.isArray(source) &&
      typeof source.expression === "string"
    ) {
      return source.expression;
    }

    return this.formatValue(source);
  }

  renderActions() {
    const actions = document.createElement("div");

    actions.className = "routelens-details-actions";

    const navigateButton = document.createElement("button");

    navigateButton.type = "button";
    navigateButton.className = "routelens-primary-button";
    navigateButton.textContent = "Open Source";

    navigateButton.addEventListener("click", () => {
      if (
        this.destroyed ||
        typeof this.onNavigate !== "function" ||
        !this.route
      ) {
        return;
      }

      this.onNavigate(this.route);
    });

    actions.appendChild(navigateButton);

    this.element.appendChild(actions);
  }

  createSection(title) {
    const section = document.createElement("section");

    section.className = "routelens-details-section";

    const heading = document.createElement("h4");

    heading.textContent = title;

    section.appendChild(heading);

    return section;
  }

  addProperty(container, label, value) {
    if (!this.hasDisplayValue(value)) {
      return;
    }

    const row = document.createElement("div");

    row.className = "routelens-detail-row";

    const name = document.createElement("span");

    name.className = "routelens-detail-label";
    name.textContent = label;

    const content = document.createElement("span");

    content.className = "routelens-detail-value";
    content.textContent = this.toDisplayString(value);

    row.append(name, content);

    container.appendChild(row);
  }

  hasDisplayValue(value) {
    return (
      value !== null &&
      value !== undefined &&
      value !== ""
    );
  }

  toDisplayString(value, fallback = "") {
    if (!this.hasDisplayValue(value)) {
      return fallback;
    }

    if (
      typeof value === "object" ||
      typeof value === "function" ||
      typeof value === "symbol"
    ) {
      return this.formatValue(value);
    }

    return String(value);
  }

  formatLabel(value) {
    return String(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) =>
        character.toUpperCase()
      );
  }

  formatValue(value) {
    if (value === null || value === undefined) {
      return "None";
    }

    if (typeof value === "string") {
      return value;
    }

    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return String(value);
    }

    if (typeof value === "function") {
      return "[Function]";
    }

    if (typeof value === "symbol") {
      return value.toString();
    }

    try {
      const serialized = JSON.stringify(value, null, 2);

      return serialized === undefined
        ? String(value)
        : serialized;
    } catch {
      return "[Unserializable value]";
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "RouteDetails has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.element?.remove();

    this.element = null;
    this.route = null;
    this.onNavigate = null;

    this.destroyed = true;
  }
}
