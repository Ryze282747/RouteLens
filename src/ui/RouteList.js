
export default class RouteList {
  constructor({
    onSelect = null,
    onNavigate = null
  } = {}) {
    this.onSelect = onSelect;
    this.onNavigate = onNavigate;

    this.element = null;
    this.routes = [];
    this.selectedId = null;

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

    element.className = "routelens-route-list";

    container.appendChild(element);

    this.element?.remove();
    this.element = element;

    this.render();

    return this.element;
  }

  setRoutes(routes) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError(
        "Routes must be provided as an array."
      );
    }

    this.routes = routes.filter((route) => {
      return (
        route !== null &&
        typeof route === "object" &&
        !Array.isArray(route)
      );
    });

    if (
      this.selectedId !== null &&
      !this.routes.some(
        (route) => route.id === this.selectedId
      )
    ) {
      this.selectedId = null;
    }

    this.render();
  }

  setSelected(routeId) {
    this.ensureActive();

    this.selectedId = routeId ?? null;

    this.render();
  }

  getGroupedRoutes() {
    const groups = new Map();

    for (const route of this.routes) {
      const key = JSON.stringify([
        this.toDisplayString(route.path, "/"),
        this.toDisplayString(route.framework, ""),
        this.toDisplayString(route.file, "")
      ]);

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(route);
    }

    return Array.from(groups.values()).map((group) => {
      if (group.length === 1) {
        return group[ 0 ];
      }

      const firstRoute = group[ 0 ];
      const methods = [];
      const seenMethods = new Set();

      for (const route of group) {
        const routeMethods = Array.isArray(route.methods)
          ? route.methods
          : [];

        for (const method of routeMethods) {
          if (
            typeof method !== "string" ||
            method.trim().length === 0
          ) {
            continue;
          }

          const normalized = method.trim().toUpperCase();

          if (seenMethods.has(normalized)) {
            continue;
          }

          seenMethods.add(normalized);
          methods.push(normalized);
        }
      }

      return {
        ...firstRoute,
        methods,
        routes: [ ...group ],
        grouped: true
      };
    });
  }

  render() {
    this.ensureActive();

    if (!this.element) {
      return;
    }

    this.element.replaceChildren();

    if (this.routes.length === 0) {
      const empty = document.createElement("div");

      empty.className = "routelens-empty-state";
      empty.textContent = "No routes found.";

      this.element.appendChild(empty);

      return;
    }

    const groupedRoutes = this.getGroupedRoutes();

    for (const route of groupedRoutes) {
      this.element.appendChild(
        this.createRouteElement(route)
      );
    }
  }

  createRouteElement(route) {
    this.ensureActive();

    if (
      !route ||
      typeof route !== "object" ||
      Array.isArray(route)
    ) {
      throw new TypeError(
        "A valid route object is required."
      );
    }

    const item = document.createElement("article");

    item.className = "routelens-route-item";

    const isSelected = this.isRouteSelected(route);

    if (isSelected) {
      item.classList.add("is-selected");
    }

    const header = document.createElement("div");

    header.className = "routelens-route-item-header";

    const methodGroup = document.createElement("div");

    methodGroup.className = "routelens-method-group";

    const methods = Array.isArray(route.methods)
      ? route.methods
      : [];

    for (const method of methods) {
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

      badge.textContent = method.trim().toUpperCase();

      methodGroup.appendChild(badge);
    }

    const path = document.createElement("div");

    path.className = "routelens-route-path";
    path.textContent = this.toDisplayString(
      route.path,
      "/"
    );

    header.append(methodGroup, path);

    const metadata = document.createElement("div");

    metadata.className = "routelens-route-metadata";

    const framework = document.createElement("span");

    framework.textContent = this.toDisplayString(
      route.framework,
      "Unknown framework"
    );

    const location = document.createElement("span");

    const file = this.toDisplayString(
      route.file,
      ""
    );

    const line = route.line;

    const hasLine =
      line !== null &&
      line !== undefined &&
      String(line).length > 0;

    location.textContent = hasLine && file
      ? `${file}:${String(line)}`
      : file || "Unknown source";

    metadata.append(framework, location);

    const actions = document.createElement("div");

    actions.className = "routelens-route-actions";

    const selectButton = document.createElement("button");

    selectButton.type = "button";
    selectButton.textContent = "Details";
    selectButton.className = "routelens-route-select";

    selectButton.setAttribute(
      "aria-pressed",
      String(isSelected)
    );

    selectButton.addEventListener("click", (event) => {
      event.stopPropagation();

      if (this.destroyed) {
        return;
      }

      this.selectRoute(route);
    });

    const navigateButton = document.createElement("button");

    navigateButton.type = "button";
    navigateButton.textContent = "Open Source";
    navigateButton.className = "routelens-route-navigate";

    navigateButton.addEventListener("click", (event) => {
      event.stopPropagation();

      if (this.destroyed) {
        return;
      }

      this.navigateToRoute(route);
    });

    actions.append(selectButton, navigateButton);

    item.append(header, metadata, actions);

    item.addEventListener("click", () => {
      if (this.destroyed) {
        return;
      }

      this.selectRoute(route);
    });

    return item;
  }

  isRouteSelected(route) {
    if (route.id === this.selectedId) {
      return true;
    }

    if (!Array.isArray(route.routes)) {
      return false;
    }

    return route.routes.some((entry) => {
      return entry.id === this.selectedId;
    });
  }

  selectRoute(route) {
    this.ensureActive();

    if (
      !route ||
      typeof route !== "object" ||
      Array.isArray(route)
    ) {
      throw new TypeError(
        "A valid route object is required."
      );
    }

    this.selectedId = route.id ?? null;

    this.render();

    if (typeof this.onSelect === "function") {
      this.onSelect(route);
    }
  }

  navigateToRoute(route) {
    this.ensureActive();

    if (
      !route ||
      typeof route !== "object" ||
      Array.isArray(route)
    ) {
      throw new TypeError(
        "A valid route object is required."
      );
    }

    const sourceRoute = Array.isArray(route.routes)
      ? route.routes[ 0 ]
      : route;

    if (typeof this.onNavigate === "function") {
      this.onNavigate(sourceRoute);
    }
  }

  getRoutes() {
    this.ensureActive();

    return [ ...this.routes ];
  }

  getSelectedId() {
    this.ensureActive();

    return this.selectedId;
  }

  toDisplayString(value, fallback = "") {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return fallback;
    }

    return String(value);
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "RouteList has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.element?.remove();

    this.element = null;
    this.routes = [];
    this.selectedId = null;

    this.onSelect = null;
    this.onNavigate = null;

    this.destroyed = true;
  }
}
