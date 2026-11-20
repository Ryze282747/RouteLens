
export default class WorkspaceManager {
  constructor({ acodeAdapter = null } = {}) {
    this.acodeAdapter = acodeAdapter;

    this.workspace = null;
    this.initialized = false;
    this.destroyed = false;
    this.listeners = new Set();
  }

  async init() {
    this.ensureActive();

    if (this.initialized) {
      return this.workspace;
    }

    this.initialized = true;

    try {
      await this.refresh();
      return this.workspace;
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  async refresh() {
    this.ensureActive();

    if (!this.acodeAdapter) {
      this.setWorkspace(null);
      return null;
    }

    if (typeof this.acodeAdapter.getWorkspace !== "function") {
      throw new Error(
        "AcodeAdapter must implement getWorkspace()."
      );
    }

    const detectedWorkspace =
      await this.acodeAdapter.getWorkspace();

    if (!detectedWorkspace) {
      this.setWorkspace(null);
      return null;
    }

    const workspace = this.normalizeWorkspace(detectedWorkspace);

    this.setWorkspace(workspace);

    return workspace;
  }

  normalizeWorkspace(workspace) {
    if (!workspace || typeof workspace !== "object") {
      throw new TypeError("Invalid workspace information.");
    }

    if (
      typeof workspace.root !== "string" ||
      !workspace.root.trim()
    ) {
      throw new Error(
        "Workspace information must contain a valid root path."
      );
    }

    return {
      root: workspace.root,
      name:
        workspace.name ||
        workspace.root.split("/").filter(Boolean).pop() ||
        "Workspace",
      uri: workspace.uri || null,
      source: workspace.source || "acode",
      detectedAt: Date.now()
    };
  }

  setWorkspace(workspace) {
    this.ensureActive();

    const previousWorkspace = this.workspace;
    this.workspace = workspace;

    if (
      previousWorkspace?.root !== workspace?.root ||
      previousWorkspace?.uri !== workspace?.uri
    ) {
      this.emit({
        type: "workspace:changed",
        workspace,
        previousWorkspace
      });
    }

    return this.workspace;
  }

  getWorkspace() {
    this.ensureActive();
    return this.workspace;
  }

  hasWorkspace() {
    this.ensureActive();
    return this.workspace !== null;
  }

  subscribe(callback) {
    this.ensureActive();

    if (typeof callback !== "function") {
      throw new TypeError("Callback must be a function.");
    }

    this.listeners.add(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  emit(event) {
    for (const listener of [ ...this.listeners ]) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          "[RouteLens] Workspace listener error:",
          error
        );
      }
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("WorkspaceManager has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.workspace = null;
    this.listeners.clear();
    this.initialized = false;
    this.destroyed = true;
    this.acodeAdapter = null;
  }
}
