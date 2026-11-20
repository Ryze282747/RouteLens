import RouteLensController from "./core/RouteLensController.js";
import RouteLensPanel from "./ui/RouteLensPanel.js";
import EditorAdapter from "./adapters/EditorAdapter.js";
import RouteNavigator from "./navigation/RouteNavigator.js";

const PLUGIN_ID = "com.zylle.routelens";
const COMMAND_NAME = "routelens.open";
const COMMAND_DESCRIPTION = "RouteLens: Open API Route Explorer";
const STYLESHEET_ID = "routelens-stylesheet";

class RouteLensPlugin {
  constructor() {
    this.controller = null;
    this.panel = null;

    this.routeTab = null;
    this.routeTabContent = null;
    this.routeTabCloseHandler = null;

    this.editorAdapter = null;
    this.navigator = null;

    this.acode = null;
    this.commands = null;

    this.stylesheetElement = null;
    this.baseUrl = "";

    this.initialized = false;
    this.destroyed = false;

    this.initPromise = null;
    this.destroyPromise = null;
    this.panelMountPromise = null;
    this.tabOpenPromise = null;
  }

  init(baseUrl = "") {
    if (this.destroyed) {
      return Promise.reject(
        new Error("Cannot initialize a destroyed RouteLensPlugin.")
      );
    }

    if (this.initialized) {
      return Promise.resolve(true);
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.baseUrl = this.normalizeBaseUrl(baseUrl);

    const controller = new RouteLensController();
    this.controller = controller;

    const promise = this.initialize(controller);

    this.initPromise = promise;

    return promise;
  }

  async initialize(controller) {
    try {
      this.acode = this.getAcode();

      if (
        !this.acode ||
        typeof this.acode.require !== "function"
      ) {
        throw new Error(
          "Acode plugin APIs are not available."
        );
      }

      this.loadStylesheet();

      await controller.init();

      this.ensureActive(controller);

      this.registerCommand();

      this.ensureActive(controller);

      this.initialized = true;

      console.log(
        "[RouteLens] Plugin initialized successfully."
      );

      return true;
    } catch (error) {
      if (!this.destroyed) {
        console.error(
          "[RouteLens] Failed to initialize plugin:",
          error
        );
      }

      this.initialized = false;

      this.removeCommand();

      await this.closeRouteTab();
      await this.unmountPanel();

      this.removeStylesheet();

      if (this.controller === controller) {
        this.controller = null;
      }

      try {
        await controller.destroy();
      } catch (cleanupError) {
        console.error(
          "[RouteLens] Controller cleanup failed:",
          cleanupError
        );
      }

      return false;
    } finally {
      this.initPromise = null;
    }
  }

  getAcode() {
    if (
      typeof window !== "undefined" &&
      window.acode
    ) {
      return window.acode;
    }

    if (typeof acode !== "undefined") {
      return acode;
    }

    return null;
  }

  normalizeBaseUrl(baseUrl) {
    if (typeof baseUrl !== "string" || !baseUrl) {
      return "";
    }

    return baseUrl.endsWith("/")
      ? baseUrl
      : `${baseUrl}/`;
  }

  ensureActive(controller) {
    if (
      this.destroyed ||
      this.controller !== controller
    ) {
      throw new Error(
        "RouteLens initialization was interrupted."
      );
    }
  }

  loadStylesheet() {
    if (this.stylesheetElement) {
      return;
    }

    if (typeof document === "undefined") {
      throw new Error(
        "Document is not available for loading RouteLens styles."
      );
    }

    if (!this.baseUrl) {
      throw new Error(
        "Plugin base URL is unavailable; cannot load RouteLens styles."
      );
    }

    const existing = document.getElementById(
      STYLESHEET_ID
    );

    if (existing) {
      this.stylesheetElement = existing;
      return;
    }

    const parent =
      document.head || document.documentElement;

    if (!parent) {
      throw new Error(
        "Document head is not available."
      );
    }

    const stylesheet = document.createElement("link");

    stylesheet.id = STYLESHEET_ID;
    stylesheet.rel = "stylesheet";
    stylesheet.type = "text/css";
    stylesheet.href = `${this.baseUrl}dist/styles.css`;

    parent.appendChild(stylesheet);

    this.stylesheetElement = stylesheet;

    console.log(
      "[RouteLens] Global stylesheet loaded."
    );
  }

  removeStylesheet() {
    if (!this.stylesheetElement) {
      return;
    }

    this.stylesheetElement.remove();
    this.stylesheetElement = null;

    console.log(
      "[RouteLens] Global stylesheet removed."
    );
  }

  getEditorFileConstructor() {
    if (!this.acode) {
      throw new Error(
        "Acode API is unavailable."
      );
    }

    for (const moduleName of [ "editorFile", "EditorFile" ]) {
      try {
        const EditorFile = this.acode.require(moduleName);

        if (typeof EditorFile === "function") {
          return EditorFile;
        }
      } catch {
        // Try the next module name.
      }
    }

    throw new Error(
      "Acode EditorFile API is unavailable. Custom editor tabs are required by RouteLens."
    );
  }

  createRouteTab() {
    if (this.routeTab) {
      return this.routeTab;
    }

    if (!this.baseUrl) {
      throw new Error(
        "Plugin base URL is unavailable."
      );
    }

    const EditorFile = this.getEditorFileConstructor();

    const content = document.createElement("div");

    content.className = "routelens-editor-tab";
    content.setAttribute("data-plugin", "routelens");

    const tab = new EditorFile("RouteLens", {
      type: "custom",
      content,
      render: true,
      editable: false,
      hideQuickTools: true,
      stylesheets: [
        `${this.baseUrl}dist/styles.css`
      ]
    });

    if (!tab) {
      throw new Error(
        "Acode failed to create the RouteLens editor tab."
      );
    }

    this.routeTab = tab;
    this.routeTabContent = content;

    this.routeTabCloseHandler = () => {
      this.handleRouteTabClose(tab);
    };

    if (typeof tab.on === "function") {
      tab.on("close", this.routeTabCloseHandler);
    }

    console.log(
      "[RouteLens] Custom editor tab created."
    );

    return tab;
  }

  async handleRouteTabClose(tab) {
    if (this.routeTab !== tab) {
      return;
    }

    console.log(
      "[RouteLens] Editor tab closed."
    );

    if (
      this.routeTabCloseHandler &&
      typeof tab.off === "function"
    ) {
      tab.off("close", this.routeTabCloseHandler);
    }

    this.routeTab = null;
    this.routeTabContent = null;
    this.routeTabCloseHandler = null;

    await this.unmountPanel();
  }

  async openTab() {
    if (
      this.destroyed ||
      !this.initialized ||
      !this.controller
    ) {
      return false;
    }

    if (this.tabOpenPromise) {
      return this.tabOpenPromise;
    }

    const promise = this.openTabInternal();

    this.tabOpenPromise = promise;

    try {
      return await promise;
    } finally {
      if (this.tabOpenPromise === promise) {
        this.tabOpenPromise = null;
      }
    }
  }

  async openTabInternal() {
    let tab = null;

    try {
      tab = this.routeTab || this.createRouteTab();

      if (this.destroyed) {
        return false;
      }

      if (typeof tab.makeActive !== "function") {
        throw new Error(
          "The RouteLens editor tab cannot be activated."
        );
      }

      await tab.makeActive();

      if (
        this.destroyed ||
        this.routeTab !== tab
      ) {
        return false;
      }

      const mounted = await this.mountPanel();

      if (
        !mounted ||
        this.destroyed ||
        this.routeTab !== tab
      ) {
        return false;
      }

      console.log(
        "[RouteLens] Editor tab opened."
      );

      return true;
    } catch (error) {
      console.error(
        "[RouteLens] Failed to open editor tab:",
        error
      );

      return false;
    }
  }

  registerCommand() {
    if (this.commands) {
      return;
    }

    if (!this.acode) {
      throw new Error(
        "Acode API is not available."
      );
    }

    const commands = this.acode.require("commands");

    if (
      !commands ||
      typeof commands.addCommand !== "function" ||
      typeof commands.removeCommand !== "function"
    ) {
      throw new Error(
        "Acode Commands API is not available."
      );
    }

    this.commands = commands;

    commands.addCommand({
      name: COMMAND_NAME,
      description: COMMAND_DESCRIPTION,
      exec: () => {
        void this.openTab();

        return true;
      }
    });

    console.log(
      "[RouteLens] Command registered:",
      COMMAND_DESCRIPTION
    );
  }

  removeCommand() {
    if (!this.commands) {
      return;
    }

    try {
      this.commands.removeCommand(COMMAND_NAME);
    } catch (error) {
      console.error(
        "[RouteLens] Failed to remove command:",
        error
      );
    }

    this.commands = null;
  }

  mountPanel() {
    if (
      this.destroyed ||
      !this.controller ||
      !this.routeTab ||
      !this.routeTabContent
    ) {
      return Promise.resolve(false);
    }

    if (this.panel) {
      return Promise.resolve(true);
    }

    if (this.panelMountPromise) {
      return this.panelMountPromise;
    }

    const controller = this.controller;
    const tab = this.routeTab;
    const container = this.routeTabContent;

    const promise = this.initializePanel(
      container,
      controller,
      tab
    );

    this.panelMountPromise = promise;

    return promise.finally(() => {
      if (this.panelMountPromise === promise) {
        this.panelMountPromise = null;
      }
    });
  }

  async initializePanel(container, controller, tab) {
    let panel = null;
    let editorAdapter = null;
    let navigator = null;

    try {
      if (
        this.destroyed ||
        this.controller !== controller ||
        this.routeTab !== tab
      ) {
        return false;
      }

      editorAdapter = new EditorAdapter();

      navigator = new RouteNavigator({
        editorAdapter
      });

      this.editorAdapter = editorAdapter;
      this.navigator = navigator;

      panel = new RouteLensPanel({
        controller,
        navigator,
        acode: this.acode
      });

      this.panel = panel;

      await panel.init(container);

      if (
        this.destroyed ||
        this.controller !== controller ||
        this.routeTab !== tab ||
        this.panel !== panel
      ) {
        await panel.destroy();

        if (this.panel === panel) {
          this.panel = null;
        }

        this.destroyNavigation(
          navigator,
          editorAdapter
        );

        return false;
      }

      console.log(
        "[RouteLens] Editor tab panel mounted."
      );

      return true;
    } catch (error) {
      console.error(
        "[RouteLens] Failed to mount editor tab panel:",
        error
      );

      if (panel) {
        try {
          await panel.destroy();
        } catch (cleanupError) {
          console.error(
            "[RouteLens] Panel cleanup failed:",
            cleanupError
          );
        }
      }

      if (this.panel === panel) {
        this.panel = null;
      }

      this.destroyNavigation(
        navigator,
        editorAdapter
      );

      return false;
    }
  }

  destroyNavigation(
    navigator = this.navigator,
    editorAdapter = this.editorAdapter
  ) {
    if (navigator) {
      try {
        navigator.destroy();
      } catch (error) {
        console.error(
          "[RouteLens] Navigator cleanup failed:",
          error
        );
      }
    }

    if (editorAdapter) {
      try {
        editorAdapter.destroy();
      } catch (error) {
        console.error(
          "[RouteLens] Editor adapter cleanup failed:",
          error
        );
      }
    }

    if (this.navigator === navigator) {
      this.navigator = null;
    }

    if (this.editorAdapter === editorAdapter) {
      this.editorAdapter = null;
    }
  }

  async unmountPanel() {
    const panel = this.panel;
    const mountPromise = this.panelMountPromise;

    this.panel = null;

    if (panel) {
      try {
        await panel.destroy();
      } catch (error) {
        console.error(
          "[RouteLens] Panel cleanup failed:",
          error
        );
      }
    }

    if (mountPromise) {
      try {
        await mountPromise;
      } catch (error) {
        console.error(
          "[RouteLens] Panel mounting cleanup failed:",
          error
        );
      }
    }

    if (this.panel) {
      const remainingPanel = this.panel;

      this.panel = null;

      try {
        await remainingPanel.destroy();
      } catch (error) {
        console.error(
          "[RouteLens] Remaining panel cleanup failed:",
          error
        );
      }
    }

    this.destroyNavigation();
  }

  async closeRouteTab() {
    const tab = this.routeTab;

    if (!tab) {
      return;
    }

    this.routeTab = null;
    this.routeTabContent = null;

    if (
      this.routeTabCloseHandler &&
      typeof tab.off === "function"
    ) {
      tab.off("close", this.routeTabCloseHandler);
    }

    this.routeTabCloseHandler = null;

    if (typeof tab.remove === "function") {
      try {
        await tab.remove(true);
      } catch (error) {
        console.error(
          "[RouteLens] Failed to close editor tab:",
          error
        );
      }
    }

    console.log(
      "[RouteLens] Editor tab removed."
    );
  }

  async destroy() {
    if (this.destroyPromise) {
      return this.destroyPromise;
    }

    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.initialized = false;

    const controller = this.controller;
    const initPromise = this.initPromise;

    this.destroyPromise = (async () => {
      this.removeCommand();

      await this.closeRouteTab();
      await this.unmountPanel();

      this.removeStylesheet();

      if (controller) {
        try {
          await controller.destroy();
        } catch (error) {
          console.error(
            "[RouteLens] Controller destruction failed:",
            error
          );
        }
      }

      if (initPromise) {
        try {
          await initPromise;
        } catch {
          // Initialization cleanup is handled by initialize().
        }
      }

      if (this.controller === controller) {
        this.controller = null;
      }

      this.panel = null;
      this.routeTab = null;
      this.routeTabContent = null;
      this.editorAdapter = null;
      this.navigator = null;
      this.commands = null;
      this.acode = null;

      this.initialized = false;

      console.log(
        "[RouteLens] Plugin destroyed."
      );
    })();

    return this.destroyPromise;
  }
}

const plugin = new RouteLensPlugin();

if (typeof window !== "undefined") {
  window.RouteLens = plugin;
}

const acodeInstance =
  typeof window !== "undefined" && window.acode
    ? window.acode
    : typeof acode !== "undefined"
      ? acode
      : null;

if (
  acodeInstance &&
  typeof acodeInstance.setPluginInit === "function" &&
  typeof acodeInstance.setPluginUnmount === "function"
) {
  acodeInstance.setPluginInit(
    PLUGIN_ID,
    async (baseUrl) => {
      await plugin.init(baseUrl);
    }
  );

  acodeInstance.setPluginUnmount(
    PLUGIN_ID,
    () => {
      void plugin.destroy().catch((error) => {
        console.error(
          "[RouteLens] Plugin unmount failed:",
          error
        );
      });
    }
  );
}

export default plugin;
