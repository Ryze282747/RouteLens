
export default class EditorAdapter {
  constructor({ acodeAdapter = null } = {}) {
    this.acodeAdapter = acodeAdapter;
    this.destroyed = false;
  }

  getAcode() {
    this.ensureActive();

    if (typeof window !== "undefined") {
      return window.acode || null;
    }

    return null;
  }

  getEditorManager() {
    this.ensureActive();

    if (this.acodeAdapter?.getEditorManager) {
      return this.acodeAdapter.getEditorManager();
    }

    if (typeof window !== "undefined") {
      return (
        window.editorManager ||
        window.acode?.editorManager ||
        null
      );
    }

    return null;
  }

  getActiveEditor() {
    this.ensureActive();

    if (this.acodeAdapter?.getActiveEditor) {
      return this.acodeAdapter.getActiveEditor();
    }

    const manager = this.getEditorManager();

    return (
      manager?.activePane?.editor ||
      manager?.editor ||
      null
    );
  }

  getActiveFile() {
    this.ensureActive();

    if (this.acodeAdapter?.getActiveFile) {
      return this.acodeAdapter.getActiveFile();
    }

    const manager = this.getEditorManager();

    return (
      manager?.activeFile ||
      manager?.activePane?.activeFile ||
      null
    );
  }

  getEditorFileConstructor() {
    this.ensureActive();

    const acode = this.getAcode();

    if (!acode || typeof acode.require !== "function") {
      return null;
    }

    // Acode documentation has used both module names.
    for (const moduleName of [ "EditorFile", "editorFile" ]) {
      try {
        const EditorFile = acode.require(moduleName);

        if (typeof EditorFile === "function") {
          return EditorFile;
        }
      } catch {
        // Try the next supported module name.
      }
    }

    return null;
  }

  findOpenFile(filePath, manager) {
    this.ensureActive();

    if (typeof manager?.getFile === "function") {
      try {
        const file = manager.getFile(filePath, "uri");

        if (file) {
          return file;
        }
      } catch {
        // Fall back to checking the open file list.
      }
    }

    if (Array.isArray(manager?.files)) {
      return (
        manager.files.find(
          (file) => file?.uri === filePath
        ) || null
      );
    }

    return null;
  }

  async activateFile(file, manager) {
    this.ensureActive();

    if (!file) {
      return false;
    }

    if (typeof file.makeActive === "function") {
      await file.makeActive();
      return true;
    }

    if (
      file.id &&
      typeof manager?.switchFile === "function"
    ) {
      await manager.switchFile(file.id);
      return true;
    }

    return false;
  }

  async waitForFileLoad(file) {
    this.ensureActive();

    if (!file) {
      return;
    }

    if (file.loaded === true || file.loading !== true) {
      return;
    }

    if (
      typeof file.on !== "function" ||
      typeof file.off !== "function"
    ) {
      return;
    }

    await new Promise((resolve, reject) => {
      let timeoutId = null;
      let settled = false;

      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        file.off("loadEnd", handleLoad);
        file.off("loadError", handleError);
      };

      const finish = (error = null) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const handleLoad = () => {
        finish();
      };

      const handleError = (event) => {
        finish(
          event?.error ||
          new Error("Acode could not load the selected source file.")
        );
      };

      file.on("loadEnd", handleLoad);
      file.on("loadError", handleError);

      timeoutId = setTimeout(() => {
        finish(
          new Error("Timed out while waiting for Acode to load the source file.")
        );
      }, 15000);
    });

    this.ensureActive();
  }

  getFileName(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/").filter(Boolean);

    const fileName = segments.length
      ? segments[ segments.length - 1 ]
      : "";

    if (!fileName) {
      throw new TypeError(
        "Could not determine the source file name."
      );
    }

    return fileName;
  }

  async openFile(filePath) {
    this.ensureActive();
    this.validatePath(filePath);

    const manager = this.getEditorManager();

    if (!manager) {
      throw new Error(
        "Acode editor manager is unavailable."
      );
    }

    // Reuse an existing editor tab when possible.
    const existingFile = this.findOpenFile(
      filePath,
      manager
    );

    if (existingFile) {
      const activated = await this.activateFile(
        existingFile,
        manager
      );

      if (!activated) {
        throw new Error(
          "Acode found the source file but could not activate its editor tab."
        );
      }

      await this.waitForFileLoad(existingFile);

      return true;
    }

    const acode = this.getAcode();

    if (!acode) {
      throw new Error(
        "Acode is unavailable. Cannot create an editor tab."
      );
    }

    const fileName = this.getFileName(filePath);

    const options = {
      uri: filePath,
      render: true,
      editable: true
    };

    let openedFile = null;

    // Preferred: create an EditorFile directly.
    const EditorFile = this.getEditorFileConstructor();

    if (EditorFile) {
      openedFile = new EditorFile(fileName, options);
    } else if (
      typeof acode.newEditorFile === "function"
    ) {
      // Compatibility fallback for Acode versions
      // exposing the convenience method.
      acode.newEditorFile(fileName, options);

      openedFile =
        this.findOpenFile(filePath, manager) ||
        manager.activeFile ||
        manager.activePane?.activeFile ||
        null;
    } else {
      throw new Error(
        "This Acode version does not expose EditorFile or acode.newEditorFile."
      );
    }

    this.ensureActive();

    // Some Acode versions register the file asynchronously.
    openedFile =
      openedFile ||
      this.findOpenFile(filePath, manager) ||
      manager.activeFile ||
      manager.activePane?.activeFile ||
      null;

    if (!openedFile) {
      throw new Error(
        "Acode did not register the newly created editor tab."
      );
    }

    const activated = await this.activateFile(
      openedFile,
      manager
    );

    if (!activated) {
      throw new Error(
        "Acode created the editor tab but could not activate it."
      );
    }

    await this.waitForFileLoad(openedFile);

    return true;
  }

  async goToLine(line) {
    this.ensureActive();

    if (!Number.isInteger(line) || line < 1) {
      throw new TypeError(
        "Line number must be a positive integer."
      );
    }

    const editor = this.getActiveEditor();

    if (!editor) {
      throw new Error(
        "No active editor is available."
      );
    }

    const targetLine = line - 1;

    // CodeMirror 5 compatibility.
    if (typeof editor.getDoc === "function") {
      const doc = editor.getDoc();

      if (
        typeof doc?.line === "function" &&
        typeof editor.setCursor === "function"
      ) {
        doc.line(line);

        editor.setCursor({
          line: targetLine,
          ch: 0
        });

        this.focusEditor(editor);

        return true;
      }
    }

    // CodeMirror 6.
    if (
      typeof editor.dispatch === "function" &&
      typeof editor.state?.doc?.line === "function"
    ) {
      const lineInfo = editor.state.doc.line(line);

      editor.dispatch({
        selection: {
          anchor: lineInfo.from
        },
        scrollIntoView: true
      });

      this.focusEditor(editor);

      return true;
    }

    // Legacy Acode editor compatibility.
    if (typeof editor.gotoLine === "function") {
      await editor.gotoLine(line);

      this.focusEditor(editor);

      return true;
    }

    throw new Error(
      "The active editor does not support line navigation."
    );
  }

  async openFileAt(filePath, line = null) {
    this.ensureActive();

    const opened = await this.openFile(filePath);

    if (!opened) {
      return false;
    }

    if (line !== null && line !== undefined) {
      await this.goToLine(line);
    }

    return true;
  }

  focusEditor(editor = null) {
    const target = editor || this.getActiveEditor();

    if (!target) {
      return;
    }

    if (typeof target.focus === "function") {
      target.focus();
      return;
    }

    const contentElement =
      target.contentDOM ||
      target.getWrapperElement?.() ||
      null;

    contentElement?.focus?.();
  }

  getDocumentContent() {
    this.ensureActive();

    const editor = this.getActiveEditor();

    if (!editor) {
      return null;
    }

    if (typeof editor.getValue === "function") {
      return editor.getValue();
    }

    if (editor.state?.doc) {
      return editor.state.doc.toString();
    }

    return null;
  }

  validatePath(filePath) {
    if (
      typeof filePath !== "string" ||
      !filePath.trim()
    ) {
      throw new TypeError(
        "A valid source file path is required."
      );
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "EditorAdapter has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.acodeAdapter = null;
    this.destroyed = true;
  }
}
