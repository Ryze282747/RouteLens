import SourceLocator from "./SourceLocator.js";

export default class RouteNavigator {
  constructor({
    editorAdapter,
    sourceLocator
  } = {}) {
    if (!editorAdapter) {
      throw new Error(
        "RouteNavigator requires an EditorAdapter."
      );
    }

    this.editorAdapter = editorAdapter;

    this.ownsSourceLocator = sourceLocator === undefined;

    this.sourceLocator = this.ownsSourceLocator
      ? new SourceLocator()
      : sourceLocator;

    if (
      !this.sourceLocator ||
      typeof this.sourceLocator.locate !== "function"
    ) {
      throw new TypeError(
        "RouteNavigator requires a valid SourceLocator."
      );
    }

    this.destroyed = false;
    this.lastNavigation = null;
    this.navigationToken = 0;
  }

  async navigate(route) {
    this.ensureActive();
    this.validateRoute(route);

    const token = ++this.navigationToken;

    const location = await this.sourceLocator.locate(route);

    this.ensureNavigationActive(token);

    if (!location) {
      throw new Error(
        "Unable to determine the route's source location."
      );
    }

    this.validateLocation(location);

    const opened = await this.openFile(
      location.file,
      "Unable to open source file",
      token
    );

    if (!opened) {
      throw new Error(
        `Unable to open source file: ${location.file}`
      );
    }

    await this.navigateToLine(location.line, token);

    this.ensureNavigationActive(token);

    this.lastNavigation = {
      routeId: route.id || null,
      file: location.file,
      line: location.line,
      navigatedAt: Date.now()
    };

    return this.lastNavigation;
  }

  async navigateToHandler(route) {
    this.ensureActive();
    this.validateRoute(route);

    if (
      typeof this.sourceLocator.locateHandler !== "function"
    ) {
      return this.navigate(route);
    }

    const token = ++this.navigationToken;

    const location = await this.sourceLocator.locateHandler(
      route
    );

    this.ensureNavigationActive(token);

    if (!location) {
      return this.navigate(route);
    }

    this.validateLocation(location);

    const opened = await this.openFile(
      location.file,
      "Unable to open handler file",
      token
    );

    if (!opened) {
      throw new Error(
        `Unable to open handler file: ${location.file}`
      );
    }

    await this.navigateToLine(location.line, token);

    this.ensureNavigationActive(token);

    this.lastNavigation = {
      routeId: route.id || null,
      file: location.file,
      line: location.line,
      target: "handler",
      navigatedAt: Date.now()
    };

    return this.lastNavigation;
  }

  async openFile(file, errorMessage, token) {
    this.ensureNavigationActive(token);

    if (
      typeof this.editorAdapter?.openFile !== "function"
    ) {
      throw new Error(
        "EditorAdapter must implement openFile()."
      );
    }

    const opened = await this.editorAdapter.openFile(file);

    this.ensureNavigationActive(token);

    return opened !== false;
  }

  async navigateToLine(line, token) {
    this.ensureNavigationActive(token);

    if (
      line !== null &&
      line !== undefined &&
      typeof this.editorAdapter?.goToLine === "function"
    ) {
      await this.editorAdapter.goToLine(line);

      this.ensureNavigationActive(token);
    }
  }

  validateLocation(location) {
    if (
      !location ||
      typeof location !== "object" ||
      typeof location.file !== "string" ||
      !location.file.trim()
    ) {
      throw new TypeError(
        "SourceLocator must return a valid location with a file."
      );
    }
  }

  getLastNavigation() {
    this.ensureActive();
    return this.lastNavigation;
  }

  validateRoute(route) {
    if (
      !route ||
      typeof route !== "object" ||
      typeof route.file !== "string" ||
      !route.file.trim()
    ) {
      throw new TypeError(
        "A valid route with a source file is required."
      );
    }
  }

  ensureNavigationActive(token) {
    this.ensureActive();

    if (token !== this.navigationToken) {
      throw new Error(
        "Navigation was superseded by another navigation request."
      );
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "RouteNavigator has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.navigationToken++;

    if (
      this.ownsSourceLocator &&
      this.sourceLocator &&
      typeof this.sourceLocator.destroy === "function"
    ) {
      this.sourceLocator.destroy();
    }

    this.editorAdapter = null;
    this.sourceLocator = null;
    this.lastNavigation = null;
    this.ownsSourceLocator = false;
  }
}
