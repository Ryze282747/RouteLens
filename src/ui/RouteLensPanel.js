import RouteList from "./RouteList.js";
import RouteDetails from "./RouteDetails.js";
import RouteFilters from "./RouteFilters.js";
import RouteSearch from "./RouteSearch.js";
import RouteStatistics from "./RouteStatistics.js";

export default class RouteLensPanel {
  constructor({
    controller,
    analyzer = null,
    navigator = null,
    exportManager = null,
    acode = null
  } = {}) {
    if (!controller) {
      throw new Error(
        "RouteLensPanel requires a RouteLensController."
      );
    }

    this.controller = controller;
    this.analyzer = analyzer;
    this.navigator = navigator;
    this.exportManager = exportManager;

    this.acode =
      acode ||
      (typeof window !== "undefined" ? window.acode : null);

    this.element = null;
    this.container = null;

    this.routeList = null;
    this.routeDetails = null;
    this.routeDetailsRegion = null;
    this.routeFilters = null;
    this.routeSearch = null;
    this.routeStatistics = null;

    this.routes = [];
    this.filteredRoutes = [];
    this.analysis = null;
    this.selectedRoute = null;

    this.pageSize = 10;
    this.visibleRouteCount = this.pageSize;

    this.workspace = null;

    this.scanSequence = 0;
    this.navigationSequence = 0;
    this.isScanning = false;

    this.subscriptions = [];

    this.destroyed = false;
  }

  async init(container) {
    this.ensureActive();

    if (
      !container ||
      typeof container.appendChild !== "function"
    ) {
      throw new TypeError(
        "A valid DOM container is required."
      );
    }

    if (this.element) {
      return this.element;
    }

    this.container = container;

    this.createComponents();
    this.createLayout();
    this.bindEvents();
    this.subscribeToControllerEvents();

    this.routes = this.controller.getRoutes();
    this.workspace = this.controller.getWorkspace?.() || null;

    this.render();

    return this.element;
  }

  createComponents() {
    this.routeList = new RouteList({
      onSelect: (route) => this.selectRoute(route),
      onNavigate: (route) => this.navigateToRoute(route)
    });

    this.routeDetails = new RouteDetails({
      onNavigate: (route) => this.navigateToRoute(route)
    });

    this.routeFilters = new RouteFilters({
      onChange: () => this.applyFilters()
    });

    this.routeSearch = new RouteSearch({
      onChange: () => this.applyFilters()
    });

    this.routeStatistics = new RouteStatistics();
  }

  createLayout() {
    const root = document.createElement("section");

    root.className = "routelens-panel";

    root.innerHTML = `
      <header class="routelens-header">
        <div class="routelens-brand">
          <div class="routelens-brand-icon">R</div>
          <div>
            <h2>RouteLens</h2>
            <p>API Route Explorer</p>
          </div>
        </div>

        <button
          type="button"
          class="routelens-scan-button"
          data-action="scan"
        >
          <span class="routelens-scan-button-label">
            Scan Project
          </span>
        </button>
      </header>

      <div class="routelens-content">
        <section class="routelens-overview">
          <div data-region="statistics"></div>
        </section>

        <section class="routelens-toolbar">
          <div data-region="search"></div>
          <div data-region="filters"></div>
        </section>

        <section
          class="routelens-scanning"
          data-region="scanning"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          hidden
        >
          <div class="routelens-scanning-icon">
            <span class="routelens-scanning-spinner"></span>
          </div>

          <div class="routelens-scanning-info">
            <div class="routelens-scanning-heading">
              <strong data-region="scanning-title">
                Scanning project...
              </strong>

              <span class="routelens-scanning-indicator">
                IN PROGRESS
              </span>
            </div>

            <p data-region="scanning-message">
              Discovering routes and analyzing endpoints...
            </p>

            <div
              class="routelens-scanning-progress"
              aria-hidden="true"
            >
              <span></span>
            </div>
          </div>
        </section>

        <div class="routelens-main">
          <section class="routelens-list-region">
            <div class="routelens-section-heading">
              <h3>Discovered Routes</h3>
              <span data-region="route-count">0 routes</span>
            </div>

            <div data-region="route-list"></div>

            <div
              class="routelens-pagination"
              data-region="pagination"
              hidden
            >
              <div class="routelens-pagination-actions">
                <button
                  type="button"
                  class="routelens-show-more-button"
                  data-action="show-more"
                >
                  Show more routes
                </button>

                <button
                  type="button"
                  class="routelens-show-less-button"
                  data-action="show-less"
                  hidden
                >
                  Show less
                </button>
              </div>

              <span
                class="routelens-pagination-info"
                data-region="pagination-info"
              >
                Showing 10 of 30 routes
              </span>
            </div>
          </section>

          <section class="routelens-details-region">
            <div data-region="route-details"></div>
          </section>
        </div>

        <div
          class="routelens-status"
          data-region="status"
          role="status"
          aria-live="polite"
        >
          Ready to scan.
        </div>
      </div>
    `;

    this.element = root;
    this.container.appendChild(root);

    this.routeDetailsRegion = root.querySelector(
      ".routelens-details-region"
    );

    this.routeStatistics.mount(
      root.querySelector('[data-region="statistics"]')
    );

    this.routeSearch.mount(
      root.querySelector('[data-region="search"]')
    );

    this.routeFilters.mount(
      root.querySelector('[data-region="filters"]')
    );

    this.routeList.mount(
      root.querySelector('[data-region="route-list"]')
    );

    this.routeDetails.mount(
      root.querySelector('[data-region="route-details"]')
    );
  }

  subscribeToControllerEvents() {
    if (
      !this.controller ||
      typeof this.controller.on !== "function"
    ) {
      return;
    }

    const subscriptions = [
      this.controller.on("scan:started", (event) => {
        if (this.destroyed) return;

        const automatic = Boolean(
          event?.options?.automatic
        );

        this.setScanningState(true, {
          title: automatic
            ? "Updating routes..."
            : "Scanning project...",
          message: automatic
            ? "File changes detected. Updating discovered routes..."
            : "Discovering routes and analyzing endpoints..."
        });

        this.setStatus(
          automatic
            ? "Project changes detected. Updating routes..."
            : "Scanning project..."
        );
      }),

      this.controller.on("scan:completed", (result) => {
        if (this.destroyed) return;

        this.updateRoutes(result?.routes || []);

        this.setScanningState(false);

        this.setStatus(
          `Scan complete. Found ${this.routes.length} routes.`
        );

        console.log(
          "[RouteLens] Panel synchronized:",
          this.routes.length,
          "routes."
        );
      }),

      this.controller.on("scan:failed", (event) => {
        if (this.destroyed) return;

        this.setScanningState(false);

        const message =
          event?.error?.message ||
          "Workspace scan failed.";

        this.setStatus(message);

        console.error(
          "[RouteLens] Workspace scan failed:",
          event?.error
        );
      }),

      this.controller.on("workspace:changed", (event) => {
        if (this.destroyed) return;

        this.workspace = event?.workspace || null;
      })
    ];

    this.subscriptions.push(
      ...subscriptions.filter(
        (unsubscribe) => typeof unsubscribe === "function"
      )
    );
  }

  updateRoutes(routes) {
    this.ensureActive();

    this.routes = Array.isArray(routes)
      ? routes.filter(
        (route) =>
          route &&
          typeof route === "object" &&
          !Array.isArray(route)
      )
      : [];

    if (this.analyzer) {
      try {
        this.analysis = this.analyzer.analyze(this.routes);
      } catch (error) {
        console.error(
          "[RouteLens] Route analysis failed:",
          error
        );

        this.analysis = null;
      }
    }

    if (this.selectedRoute) {
      const updatedRoute = this.routes.find(
        (route) => route.id === this.selectedRoute.id
      );

      this.selectedRoute = updatedRoute || null;
      this.routeDetails.setRoute(this.selectedRoute);

      this.routeList.setSelected(
        this.selectedRoute?.id || null
      );
    }

    this.applyFilters();
  }

  bindEvents() {
    this.handleClick = (event) => {
      const target = event.target;

      if (!target || typeof target.closest !== "function") {
        return;
      }

      const scanButton = target.closest(
        '[data-action="scan"]'
      );

      if (
        scanButton &&
        this.element?.contains(scanButton)
      ) {
        if (!this.isScanning) {
          this.scan();
        }

        return;
      }

      const showMoreButton = target.closest(
        '[data-action="show-more"]'
      );

      if (
        showMoreButton &&
        this.element?.contains(showMoreButton)
      ) {
        this.showMoreRoutes();
        return;
      }

      const showLessButton = target.closest(
        '[data-action="show-less"]'
      );

      if (
        showLessButton &&
        this.element?.contains(showLessButton)
      ) {
        this.showLessRoutes();
      }
    };

    this.element.addEventListener(
      "click",
      this.handleClick
    );
  }

  showMoreRoutes() {
    this.ensureActive();

    if (
      this.visibleRouteCount >= this.filteredRoutes.length
    ) {
      return;
    }

    this.visibleRouteCount = Math.min(
      this.visibleRouteCount + this.pageSize,
      this.filteredRoutes.length
    );

    this.renderRouteList();
    this.updateRouteCount();
  }

  showLessRoutes() {
    this.ensureActive();

    if (this.visibleRouteCount <= this.pageSize) {
      return;
    }

    this.visibleRouteCount = this.pageSize;

    this.renderRouteList();
    this.updateRouteCount();
  }

  renderRouteList() {
    if (!this.routeList) {
      return;
    }

    const visibleRoutes = this.filteredRoutes.slice(
      0,
      this.visibleRouteCount
    );

    this.routeList.setRoutes(visibleRoutes);
  }

  setScanningState(active, {
    title = "Scanning project...",
    message = "Discovering routes and analyzing endpoints..."
  } = {}) {
    if (this.destroyed || !this.element) {
      return;
    }

    const scanningRegion = this.element.querySelector(
      '[data-region="scanning"]'
    );

    const scanningTitle = this.element.querySelector(
      '[data-region="scanning-title"]'
    );

    const scanningMessage = this.element.querySelector(
      '[data-region="scanning-message"]'
    );

    const scanButton = this.element.querySelector(
      '[data-action="scan"]'
    );

    const buttonLabel = this.element.querySelector(
      ".routelens-scan-button-label"
    );

    this.isScanning = Boolean(active);

    if (scanningRegion) {
      scanningRegion.hidden = !this.isScanning;
      scanningRegion.classList.toggle(
        "is-scanning",
        this.isScanning
      );
    }

    if (scanningTitle) {
      scanningTitle.textContent = title;
    }

    if (scanningMessage) {
      scanningMessage.textContent = message;
    }

    if (scanButton) {
      scanButton.disabled = this.isScanning;
      scanButton.setAttribute(
        "aria-busy",
        String(this.isScanning)
      );
    }

    if (buttonLabel) {
      buttonLabel.textContent = this.isScanning
        ? "Scanning..."
        : "Scan Project";
    }
  }

  async selectProjectFolder() {
    this.ensureActive();

    const fileBrowser = this.acode?.fileBrowser;

    if (typeof fileBrowser !== "function") {
      if (!this.acode) {
        return null;
      }

      throw new Error(
        "Acode folder picker is unavailable. Make sure the Acode fileBrowser API is supported."
      );
    }

    const selection = await fileBrowser.call(
      this.acode,
      "folder",
      "Select your project folder",
      true
    );

    this.ensureActive();

    if (!selection) {
      return null;
    }

    const selectedUrl =
      typeof selection === "string"
        ? selection
        : selection.url || selection.uri;

    if (
      typeof selectedUrl !== "string" ||
      !selectedUrl.trim()
    ) {
      throw new Error(
        "The selected folder does not contain a valid URL."
      );
    }

    const name =
      typeof selection === "object"
        ? selection.name || this.getFolderName(selectedUrl)
        : this.getFolderName(selectedUrl);

    return {
      root: selectedUrl,
      name,
      uri: selectedUrl,
      source: "file-browser"
    };
  }

  getFolderName(folderPath) {
    if (typeof folderPath !== "string") {
      return "Selected project";
    }

    const normalized = folderPath.replace(/\/+$/, "");
    const name = normalized.split("/").pop();

    if (!name) {
      return "Selected project";
    }

    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }

  async scan() {
    this.ensureActive();

    if (this.isScanning) {
      return null;
    }

    const sequence = ++this.scanSequence;

    this.setScanningState(true, {
      title: "Preparing scan...",
      message: "Getting your project ready..."
    });

    this.setStatus("Preparing project scan...");

    try {
      let workspace;

      if (this.acode) {
        this.setScanningState(true, {
          title: "Select your project folder",
          message: "Choose the folder you want RouteLens to analyze..."
        });

        this.setStatus("Select your project folder...");

        workspace = await this.selectProjectFolder();

        if (
          this.destroyed ||
          sequence !== this.scanSequence
        ) {
          return null;
        }

        if (!workspace) {
          this.setStatus("Folder selection cancelled.");
          return null;
        }

        this.setScanningState(true, {
          title: "Preparing workspace...",
          message: `Setting up ${workspace.name}...`
        });

        this.setStatus(`Preparing ${workspace.name}...`);

        const selectedWorkspace =
          this.controller.setWorkspace(workspace);

        if (!selectedWorkspace) {
          throw new Error(
            "Unable to configure the selected workspace."
          );
        }

        this.workspace = selectedWorkspace;
      } else {
        workspace = this.controller.getWorkspace?.() || null;

        if (workspace) {
          this.workspace = workspace;
        }
      }

      if (
        this.destroyed ||
        sequence !== this.scanSequence
      ) {
        return null;
      }

      const workspaceName = this.workspace?.name;

      this.setScanningState(true, {
        title: workspaceName
          ? `Scanning ${workspaceName}...`
          : "Scanning project...",
        message: "Discovering route files and analyzing endpoints..."
      });

      this.setStatus(
        workspaceName
          ? `Scanning ${workspaceName}...`
          : "Scanning project..."
      );

      const result = await this.controller.scanWorkspace();

      if (
        this.destroyed ||
        sequence !== this.scanSequence
      ) {
        return result;
      }

      const discoveredRoutes = Array.isArray(result?.routes)
        ? result.routes.filter(
          (route) =>
            route &&
            typeof route === "object" &&
            !Array.isArray(route)
        )
        : [];

      this.updateRoutes(discoveredRoutes);

      this.setStatus(
        `Scan complete. Found ${this.routes.length} routes.`
      );

      return result;
    } catch (error) {
      if (
        this.destroyed ||
        sequence !== this.scanSequence
      ) {
        return null;
      }

      const details = this.getErrorDetails(error);

      console.error(
        "[RouteLens] Scan failed:",
        details.message
      );

      console.error(
        "[RouteLens] Scan error details:",
        details
      );

      console.error(
        "[RouteLens] Original error value:",
        error
      );

      this.setStatus(details.message);

      return null;
    } finally {
      if (
        !this.destroyed &&
        sequence === this.scanSequence
      ) {
        this.setScanningState(false);
      }
    }
  }

  getErrorDetails(error) {
    if (error === null) {
      return {
        name: "NullError",
        message: "An unknown null error was thrown.",
        stack: null,
        properties: {}
      };
    }

    if (error === undefined) {
      return {
        name: "UndefinedError",
        message: "An undefined error was thrown.",
        stack: null,
        properties: {}
      };
    }

    if (
      typeof error !== "object" &&
      typeof error !== "function"
    ) {
      return {
        name: typeof error,
        message: String(error),
        stack: null,
        properties: {}
      };
    }

    const properties = {};

    try {
      for (const key of Object.getOwnPropertyNames(error)) {
        try {
          const value = error[ key ];

          properties[ key ] =
            typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean" ||
              value === null
              ? value
              : String(value);
        } catch (propertyError) {
          properties[ key ] =
            `[Unable to read property: ${String(propertyError)}]`;
        }
      }
    } catch (inspectionError) {
      properties.inspectionError = String(inspectionError);
    }

    let name = "Error";
    let message = "";
    let stack = null;

    try {
      name = error.name || name;
      message = error.message
        ? String(error.message)
        : "";
      stack = error.stack || null;
    } catch (inspectionError) {
      properties.inspectionError = String(inspectionError);
    }

    if (!message) {
      try {
        message = JSON.stringify(error);
      } catch {
        message = "";
      }
    }

    if (
      !message ||
      message === "{}" ||
      message === "[]"
    ) {
      const entries = Object.entries(properties);

      message = entries.length
        ? entries
          .map(([ key, value ]) => `${key}: ${value}`)
          .join(", ")
        : String(error);
    }

    if (!message || message === "[object Object]") {
      message = "Unknown error. Check the console for details.";
    }

    return {
      name: String(name),
      message,
      stack,
      properties
    };
  }

  applyFilters() {
    this.ensureActive();

    const query = this.routeSearch.getValue();
    const filters = this.routeFilters.getValue();

    this.filteredRoutes = this.routes.filter((route) => {
      return (
        this.matchesSearch(route, query) &&
        this.matchesFilters(route, filters)
      );
    });

    this.visibleRouteCount = this.pageSize;

    this.renderRouteList();

    this.routeStatistics.setData({
      total: this.routes.length,
      visible: this.filteredRoutes.length,
      frameworks: this.countFrameworks(this.routes),
      methods: this.countMethods(this.routes)
    });

    this.updateRouteCount();

    if (
      this.selectedRoute &&
      !this.filteredRoutes.some(
        (route) => route.id === this.selectedRoute.id
      )
    ) {
      this.selectRoute(null);
    }

    return this.filteredRoutes;
  }

  matchesSearch(route, query) {
    if (!route || typeof route !== "object") {
      return false;
    }

    if (!query) {
      return true;
    }

    const methods = Array.isArray(route.methods)
      ? route.methods
      : [];

    const searchable = [
      route.path,
      route.handler,
      route.controller,
      route.file,
      route.framework,
      ...methods
    ]
      .filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== ""
      )
      .map(String)
      .join(" ")
      .toLowerCase();

    return searchable.includes(String(query).toLowerCase());
  }

  matchesFilters(route, filters = {}) {
    if (!route || typeof route !== "object") {
      return false;
    }

    const methods = Array.isArray(route.methods)
      ? route.methods
      : [];

    if (
      filters.method &&
      filters.method !== "all" &&
      !methods.some(
        (method) =>
          String(method).toUpperCase() ===
          String(filters.method).toUpperCase()
      )
    ) {
      return false;
    }

    if (
      filters.framework &&
      filters.framework !== "all" &&
      route.framework !== filters.framework
    ) {
      return false;
    }

    return true;
  }

  scrollToRouteDetails() {
    if (
      this.destroyed ||
      !this.routeDetailsRegion ||
      typeof this.routeDetailsRegion.scrollIntoView !== "function"
    ) {
      return;
    }

    this.routeDetailsRegion.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  selectRoute(route) {
    this.ensureActive();

    if (
      route !== null &&
      (!route || typeof route !== "object" || Array.isArray(route))
    ) {
      throw new TypeError(
        "Selected route must be an object or null."
      );
    }

    this.selectedRoute = route || null;

    this.routeList.setSelected(
      route ? route.id : null
    );

    this.routeDetails.setRoute(route);

    if (route) {
      this.scrollToRouteDetails();
    }

    return this.selectedRoute;
  }

  async navigateToRoute(route) {
    this.ensureActive();

    const sequence = ++this.navigationSequence;

    if (!this.navigator) {
      this.setStatus("Source navigation is unavailable.");
      return null;
    }

    try {
      const result = await this.navigator.navigate(route);

      if (
        this.destroyed ||
        sequence !== this.navigationSequence
      ) {
        return result;
      }

      if (!result || typeof result !== "object") {
        throw new Error(
          "Navigation returned an invalid result."
        );
      }

      if (!result.file) {
        throw new Error(
          "Navigation did not return a source file."
        );
      }

      this.setStatus(
        `Opened ${result.file}${result.line ? ` at line ${result.line}` : ""}.`
      );

      return result;
    } catch (error) {
      if (
        this.destroyed ||
        sequence !== this.navigationSequence
      ) {
        return null;
      }

      const details = this.getErrorDetails(error);

      console.error(
        "[RouteLens] Navigation failed:",
        details
      );

      this.setStatus(details.message);

      return null;
    }
  }

  countFrameworks(routes) {
    const counts = {};

    for (const route of routes) {
      if (!route || typeof route !== "object") {
        continue;
      }

      const framework = route.framework || "unknown";

      counts[ framework ] = (counts[ framework ] || 0) + 1;
    }

    return counts;
  }

  countMethods(routes) {
    const counts = {};

    for (const route of routes) {
      if (!route || typeof route !== "object") {
        continue;
      }

      const methods = Array.isArray(route.methods)
        ? route.methods
        : [];

      for (const method of methods) {
        if (
          method === null ||
          method === undefined ||
          method === ""
        ) {
          continue;
        }

        const name = String(method);

        counts[ name ] = (counts[ name ] || 0) + 1;
      }
    }

    return counts;
  }

  updateRouteCount() {
    if (!this.element) {
      return;
    }

    const visibleCount = Math.min(
      this.visibleRouteCount,
      this.filteredRoutes.length
    );

    const totalCount = this.filteredRoutes.length;

    const countElement = this.element.querySelector(
      '[data-region="route-count"]'
    );

    const paginationRegion = this.element.querySelector(
      '[data-region="pagination"]'
    );

    const paginationInfo = this.element.querySelector(
      '[data-region="pagination-info"]'
    );

    const showMoreButton = this.element.querySelector(
      '[data-action="show-more"]'
    );

    const showLessButton = this.element.querySelector(
      '[data-action="show-less"]'
    );

    const hasMore = visibleCount < totalCount;
    const canCollapse = visibleCount > this.pageSize;

    if (countElement) {
      countElement.textContent =
        `Showing ${visibleCount} of ${totalCount} routes`;
    }

    if (paginationRegion) {
      paginationRegion.hidden = !hasMore && !canCollapse;
    }

    if (paginationInfo) {
      paginationInfo.textContent =
        `Showing ${visibleCount} of ${totalCount} routes`;

      if (hasMore) {
        paginationInfo.textContent +=
          ` · ${totalCount - visibleCount} remaining`;
      }
    }

    if (showMoreButton) {
      showMoreButton.hidden = !hasMore;

      const remaining = totalCount - visibleCount;
      const nextCount = Math.min(
        this.pageSize,
        remaining
      );

      showMoreButton.textContent =
        `Show ${nextCount} more routes`;
    }

    if (showLessButton) {
      showLessButton.hidden = !canCollapse;
    }
  }

  setStatus(message) {
    if (this.destroyed || !this.element) {
      return;
    }

    const status = this.element.querySelector(
      '[data-region="status"]'
    );

    if (status) {
      status.textContent = String(message);
    }
  }

  render() {
    this.applyFilters();
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("RouteLensPanel has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.scanSequence++;
    this.navigationSequence++;

    for (const unsubscribe of this.subscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        console.error(
          "[RouteLens] Panel subscription cleanup failed:",
          error
        );
      }
    }

    this.subscriptions = [];

    if (this.element && this.handleClick) {
      this.element.removeEventListener(
        "click",
        this.handleClick
      );
    }

    const components = [
      this.routeList,
      this.routeDetails,
      this.routeFilters,
      this.routeSearch,
      this.routeStatistics
    ];

    for (const component of components) {
      if (
        component &&
        typeof component.destroy === "function"
      ) {
        component.destroy();
      }
    }

    this.element?.remove();

    this.element = null;
    this.container = null;
    this.handleClick = null;

    this.routeList = null;
    this.routeDetails = null;
    this.routeDetailsRegion = null;
    this.routeFilters = null;
    this.routeSearch = null;
    this.routeStatistics = null;

    this.routes = [];
    this.filteredRoutes = [];
    this.analysis = null;
    this.selectedRoute = null;

    this.visibleRouteCount = this.pageSize;
    this.workspace = null;

    this.isScanning = false;
    this.acode = null;
    this.destroyed = true;
  }
}
