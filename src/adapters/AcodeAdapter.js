export default class AcodeAdapter {
  constructor({ acode = null, windowRef = null } = {}) {
    this.acode = acode || this.getAcodeInstance();

    this.window =
      windowRef ||
      (typeof window !== "undefined" ? window : null);

    this.destroyed = false;
  }

  getAcodeInstance() {
    if (typeof window === "undefined") {
      return null;
    }

    return window.acode || null;
  }

  async getWorkspace() {
    this.ensureActive();

    const candidates = [
      this.getWorkspaceFromAddedFolders(),
      this.getWorkspaceFromAcode(),
      this.getWorkspaceFromEditor()
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      const workspace = this.normalizeWorkspace(candidate);

      if (workspace) {
        console.log(
          "[RouteLens] Workspace detected:",
          {
            name: workspace.name,
            root: workspace.root,
            source: workspace.source
          }
        );

        return workspace;
      }
    }

    console.warn(
      "[RouteLens] No workspace could be detected."
    );

    return null;
  }

  getAddedFolders() {
    const folders =
      this.window?.addedFolder ||
      this.acode?.addedFolder ||
      null;

    if (Array.isArray(folders)) {
      return folders;
    }

    if (
      folders &&
      typeof folders === "object" &&
      typeof folders.url === "string"
    ) {
      return [ folders ];
    }

    return [];
  }

  getWorkspaceFromAddedFolders() {
    const folders = this.getAddedFolders();

    if (folders.length === 0) {
      return null;
    }

    const validFolders = folders
      .map((folder) => {
        if (
          !folder ||
          typeof folder.url !== "string" ||
          !folder.url.trim()
        ) {
          return null;
        }

        // IMPORTANT:
        // Preserve the complete Acode provider URL.
        // Do not remove the content:// prefix or the :: suffix.
        const root = folder.url.trim();

        if (!this.isDirectoryPath(root)) {
          return null;
        }

        return {
          root,
          name:
            folder.title ||
            folder.name ||
            this.getNameFromPath(root),
          uri: root,
          source: "acode-added-folder"
        };
      })
      .filter(Boolean);

    if (validFolders.length === 0) {
      return null;
    }

    const activeFile = this.getActiveFile();
    const activeFilePath =
      this.getActiveFilePath(activeFile);

    if (activeFilePath) {
      const normalizedFile =
        this.normalizeComparablePath(activeFilePath);

      const matchingFolders = validFolders
        .filter((folder) => {
          const normalizedRoot =
            this.normalizeComparablePath(folder.root);

          return (
            normalizedFile === normalizedRoot ||
            normalizedFile.startsWith(
              `${normalizedRoot}/`
            )
          );
        })
        .sort(
          (a, b) =>
            this.normalizeComparablePath(b.root).length -
            this.normalizeComparablePath(a.root).length
        );

      if (matchingFolders.length > 0) {
        return matchingFolders[ 0 ];
      }
    }

    return validFolders[ 0 ];
  }

  getWorkspaceFromAcode() {
    const project =
      this.acode?.project ||
      this.window?.project ||
      null;

    if (!project) {
      return null;
    }

    if (typeof project === "string") {
      const root = project.trim();

      return {
        root,
        name: this.getNameFromPath(root),
        source: "acode-project"
      };
    }

    const root =
      project.root ||
      project.path ||
      project.uri ||
      project.url ||
      null;

    if (typeof root !== "string" || !root.trim()) {
      return null;
    }

    return {
      root: root.trim(),
      name:
        project.name ||
        this.getNameFromPath(root),
      uri: project.uri || project.url || null,
      source: "acode-project"
    };
  }

  getWorkspaceFromEditor() {
    const activeFile = this.getActiveFile();

    if (!activeFile) {
      return null;
    }

    const filePath =
      this.getActiveFilePath(activeFile);

    if (!filePath) {
      return null;
    }

    // Preserve provider information when creating the parent URL.
    const root = this.getParentPath(filePath);

    if (!root) {
      return null;
    }

    return {
      root,
      name: this.getNameFromPath(root),
      uri: root,
      source: "active-file"
    };
  }

  getActiveFilePath(activeFile) {
    if (typeof activeFile === "string") {
      return activeFile;
    }

    if (!activeFile || typeof activeFile !== "object") {
      return null;
    }

    const candidates = [
      activeFile.uri,
      activeFile.path,
      activeFile.url,
      activeFile.filename
    ];

    return (
      candidates.find(
        (value) =>
          typeof value === "string" &&
          value.trim()
      ) || null
    );
  }

  normalizeWorkspace(workspace) {
    if (!workspace || typeof workspace !== "object") {
      return null;
    }

    const rawRoot =
      workspace.root ||
      workspace.path ||
      "";

    if (
      typeof rawRoot !== "string" ||
      !rawRoot.trim()
    ) {
      return null;
    }

    // Keep the original URL intact.
    const root = rawRoot.trim();

    if (!this.isDirectoryPath(root)) {
      return null;
    }

    return {
      root,
      name:
        workspace.name ||
        this.getNameFromPath(root),
      uri: workspace.uri || root,
      source: workspace.source || "acode"
    };
  }

  normalizeComparablePath(value) {
    if (typeof value !== "string") {
      return "";
    }

    let result = value.trim();

    // Extract the underlying path ONLY for comparisons.
    // Never use this result as the filesystem access URL.
    const separator = result.lastIndexOf("::");

    if (separator !== -1) {
      result = result.slice(separator + 2);
    }

    try {
      result = decodeURIComponent(result);
    } catch {
      // Keep the original value if decoding fails.
    }

    return result
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/+$/, "");
  }

  getParentPath(filePath) {
    if (
      typeof filePath !== "string" ||
      !filePath.trim()
    ) {
      return null;
    }

    const normalized = filePath.replace(/\/+$/, "");
    const separator = normalized.lastIndexOf("/");

    if (separator <= 0) {
      return null;
    }

    return normalized.slice(0, separator);
  }

  getNameFromPath(path) {
    if (typeof path !== "string" || !path.trim()) {
      return "Workspace";
    }

    const comparable =
      this.normalizeComparablePath(path);

    const name = comparable.split("/").pop();

    return name || "Workspace";
  }

  isDirectoryPath(path) {
    if (typeof path !== "string" || !path.trim()) {
      return false;
    }

    return (
      path.startsWith("/") ||
      path.startsWith("content://") ||
      path.startsWith("file://") ||
      path.startsWith("treeUri::") ||
      /^[a-zA-Z]:[\\/]/.test(path)
    );
  }

  getEditorManager() {
    this.ensureActive();

    return (
      this.window?.editorManager ||
      this.acode?.editorManager ||
      null
    );
  }

  getActiveFile() {
    this.ensureActive();

    const editorManager = this.getEditorManager();

    return (
      editorManager?.activeFile ||
      editorManager?.activePane?.activeFile ||
      null
    );
  }

  getActiveEditor() {
    this.ensureActive();

    const editorManager = this.getEditorManager();

    return (
      editorManager?.activePane?.editor ||
      editorManager?.editor ||
      null
    );
  }

  getPluginDataPath(pluginId) {
    this.ensureActive();

    if (
      typeof pluginId !== "string" ||
      !pluginId.trim()
    ) {
      throw new TypeError(
        "A valid plugin ID is required."
      );
    }

    const basePath =
      this.acode?.dataDir ||
      this.window?.acode?.dataDir ||
      null;

    if (
      typeof basePath !== "string" ||
      !basePath.trim()
    ) {
      return null;
    }

    return (
      `${basePath.replace(/\/+$/, "")}/${pluginId}`
    );
  }

  isAvailable() {
    return Boolean(
      this.acode || this.window?.acode
    );
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "AcodeAdapter has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.acode = null;
    this.window = null;
    this.destroyed = true;
  }
}
