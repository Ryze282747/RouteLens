export default class FileSystemAdapter {
  constructor({ fs = null, acode = null } = {}) {
    this.acode = acode || this.getAcodeInstance();
    this.fs = fs || this.getAcodeFileSystem();

    this.destroyed = false;
  }

  getAcodeInstance() {
    if (typeof window === "undefined") {
      return null;
    }

    return window.acode || null;
  }

  getAcodeFileSystem() {
    if (!this.acode) {
      return null;
    }

    try {
      return this.acode.require?.("fs") || null;
    } catch (error) {
      console.error(
        "[RouteLens] Unable to access Acode filesystem:",
        error
      );

      return null;
    }
  }

  async getFileSystem(filePath) {
    this.ensureActive();
    this.validatePath(filePath);

    if (typeof this.acode?.fsOperation === "function") {
      try {
        const filesystem = await this.acode.fsOperation(filePath);

        if (filesystem) {
          return {
            filesystem,
            mode: "acode-operation"
          };
        }
      } catch (error) {
        console.warn(
          "[RouteLens] fsOperation() could not access:",
          filePath,
          error
        );
      }
    }

    if (typeof this.fs === "function") {
      try {
        const filesystem = await this.fs(filePath);

        if (filesystem) {
          return {
            filesystem,
            mode: "acode-factory"
          };
        }
      } catch (error) {
        console.warn(
          "[RouteLens] Filesystem factory could not access:",
          filePath,
          error
        );

        throw new Error(
          `Unable to create filesystem handle for: ${filePath}`,
          { cause: error }
        );
      }

      throw new Error(
        `Unable to create filesystem handle for: ${filePath}`
      );
    }

    if (this.fs && typeof this.fs === "object") {
      return {
        filesystem: this.fs,
        mode: "legacy"
      };
    }

    throw new Error(
      `No supported filesystem API is available for: ${filePath}`
    );
  }

  async readFile(filePath, encoding = "utf8") {
    this.ensureActive();
    this.validatePath(filePath);

    const { filesystem, mode } =
      await this.getFileSystem(filePath);

    if (typeof filesystem.readFile !== "function") {
      throw new Error(
        "Filesystem adapter does not support readFile()."
      );
    }

    const content =
      mode === "legacy"
        ? await filesystem.readFile(filePath, encoding)
        : await filesystem.readFile(encoding);

    return this.normalizeContent(content);
  }

  async exists(filePath) {
    this.ensureActive();
    this.validatePath(filePath);

    try {
      const { filesystem, mode } =
        await this.getFileSystem(filePath);

      if (typeof filesystem.exists === "function") {
        return Boolean(
          mode === "legacy"
            ? await filesystem.exists(filePath)
            : await filesystem.exists()
        );
      }

      if (typeof filesystem.stat === "function") {
        if (mode === "legacy") {
          await filesystem.stat(filePath);
        } else {
          await filesystem.stat();
        }

        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async stat(filePath) {
    this.ensureActive();
    this.validatePath(filePath);

    const { filesystem, mode } =
      await this.getFileSystem(filePath);

    if (typeof filesystem.stat === "function") {
      return mode === "legacy"
        ? filesystem.stat(filePath)
        : filesystem.stat();
    }

    if (
      mode === "legacy" &&
      typeof filesystem.stats === "function"
    ) {
      return filesystem.stats(filePath);
    }

    throw new Error(
      "Filesystem adapter does not support stat()."
    );
  }

  async readDirectory(directoryPath) {
    this.ensureActive();
    this.validatePath(directoryPath);

    const { filesystem, mode } =
      await this.getFileSystem(directoryPath);

    let entries;

    if (
      mode !== "legacy" &&
      typeof filesystem.lsDir === "function"
    ) {
      entries = await filesystem.lsDir();
    } else if (
      typeof filesystem.readdir === "function"
    ) {
      entries = await filesystem.readdir(directoryPath);
    } else if (
      typeof filesystem.listDir === "function"
    ) {
      entries = await filesystem.listDir(directoryPath);
    } else if (
      typeof filesystem.lsDir === "function"
    ) {
      entries = await filesystem.lsDir();
    } else {
      throw new Error(
        "Filesystem adapter does not support directory listing."
      );
    }

    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .map((entry) => {
        if (typeof entry === "string") {
          const path = this.isAbsolutePath(entry)
            ? entry
            : this.joinPath(directoryPath, entry);

          return {
            name: this.getBaseName(entry),
            path,
            isDirectory: false,
            isFile: false
          };
        }

        if (!entry || typeof entry !== "object") {
          return null;
        }

        const entryUrl =
          entry.url ||
          entry.path ||
          "";

        const name =
          entry.name ||
          entry.filename ||
          this.getBaseName(entryUrl);

        const isDirectory =
          typeof entry.isDirectory === "function"
            ? entry.isDirectory()
            : Boolean(entry.isDirectory);

        const isFile =
          typeof entry.isFile === "function"
            ? entry.isFile()
            : Boolean(entry.isFile);

        const path = entryUrl
          ? this.isAbsolutePath(entryUrl)
            ? entryUrl
            : this.joinPath(directoryPath, entryUrl)
          : this.joinPath(directoryPath, name);

        return {
          ...entry,
          name,
          path,
          isDirectory,
          isFile
        };
      })
      .filter((entry) => entry && entry.name);
  }

  async findFiles(root, options = {}) {
    this.ensureActive();
    this.validatePath(root);

    const extensions = this.normalizeExtensions(
      options.extensions || []
    );

    const excludedDirectories = new Set(
      (options.exclude || []).map((directory) =>
        String(directory)
          .replace(/\\/g, "/")
          .replace(/^\/+|\/+$/g, "")
      )
    );

    const maxDepth = Number.isInteger(options.maxDepth)
      ? Math.max(0, options.maxDepth)
      : 30;

    const maxFiles = Number.isInteger(options.maxFiles)
      ? Math.max(1, options.maxFiles)
      : 10000;

    const results = [];
    const visited = new Set();

    const walk = async (directory, depth, isRoot = false) => {
      this.ensureActive();

      if (
        depth > maxDepth ||
        results.length >= maxFiles
      ) {
        return;
      }

      const normalizedDirectory =
        this.normalizePath(directory);

      if (visited.has(normalizedDirectory)) {
        return;
      }

      visited.add(normalizedDirectory);

      let entries;

      try {
        entries = await this.readDirectory(directory);
      } catch (error) {
        console.error(
          `[RouteLens] Unable to read directory: ${directory}`,
          error
        );

        if (isRoot) {
          throw new Error(
            `Unable to read workspace directory: ${directory}`,
            { cause: error }
          );
        }

        return;
      }

      for (const entry of entries) {
        this.ensureActive();

        if (results.length >= maxFiles) {
          return;
        }

        if (
          !entry.name ||
          entry.name === "." ||
          entry.name === ".."
        ) {
          continue;
        }

        const entryPath =
          entry.path ||
          this.joinPath(directory, entry.name);

        const relativePath = this.getRelativePath(
          root,
          entryPath
        );

        if (
          this.isExcluded(
            entry.name,
            relativePath,
            excludedDirectories
          )
        ) {
          continue;
        }

        if (entry.isDirectory) {
          await walk(entryPath, depth + 1);
          continue;
        }

        if (entry.isFile === false) {
          continue;
        }

        const extension = this.getExtension(entry.name);

        if (
          extensions.length > 0 &&
          !extensions.includes(extension)
        ) {
          continue;
        }

        if (
          typeof options.maxFileSize === "number" &&
          options.maxFileSize > 0
        ) {
          try {
            const metadata = await this.stat(entryPath);

            const size = Number(
              metadata?.size ?? metadata?.length
            );

            if (
              Number.isFinite(size) &&
              size > options.maxFileSize
            ) {
              continue;
            }
          } catch {
            continue;
          }
        }

        results.push(entryPath);
      }
    };

    await walk(root, 0, true);

    return results;
  }

  normalizeContent(content) {
    if (typeof content === "string") {
      return content;
    }

    if (content instanceof Uint8Array) {
      return new TextDecoder("utf-8").decode(content);
    }

    if (content instanceof ArrayBuffer) {
      return new TextDecoder("utf-8").decode(
        new Uint8Array(content)
      );
    }

    if (content === null || content === undefined) {
      return "";
    }

    return String(content);
  }

  normalizeExtensions(extensions) {
    if (!Array.isArray(extensions)) {
      return [];
    }

    return [
      ...new Set(
        extensions.map((extension) => {
          const value = String(extension)
            .trim()
            .toLowerCase();

          return value.startsWith(".")
            ? value
            : `.${value}`;
        })
      )
    ];
  }

  getExtension(filePath) {
    const name = String(filePath)
      .split("/")
      .pop() || "";

    const index = name.lastIndexOf(".");

    if (index <= 0) {
      return "";
    }

    return name.slice(index).toLowerCase();
  }

  getBaseName(filePath) {
    if (typeof filePath !== "string") {
      return "";
    }

    const normalized = filePath
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");

    const name = normalized.split("/").pop() || "";

    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }

  isAbsolutePath(path) {
    if (typeof path !== "string") {
      return false;
    }

    return (
      path.startsWith("/") ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(path)
    );
  }

  isExcluded(name, relativePath, excludedDirectories) {
    if (name.startsWith(".")) {
      return true;
    }

    const segments = relativePath
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);

    return segments.some((segment) =>
      excludedDirectories.has(segment)
    );
  }

  getRelativePath(root, target) {
    const normalizedRoot = this.normalizePath(root);
    const normalizedTarget = this.normalizePath(target);

    if (normalizedTarget === normalizedRoot) {
      return "";
    }

    const prefix = normalizedRoot.endsWith("/")
      ? normalizedRoot
      : `${normalizedRoot}/`;

    if (normalizedTarget.startsWith(prefix)) {
      return normalizedTarget.slice(prefix.length);
    }

    return normalizedTarget;
  }

  joinPath(...segments) {
    const filtered = segments
      .filter((segment) => typeof segment === "string");

    if (filtered.length === 0) {
      return "";
    }

    const first = filtered.shift();

    const normalizedFirst = first.replace(/\\/g, "/");

    const protocolMatch = normalizedFirst.match(
      /^([a-z][a-z0-9+.-]*:\/\/)(.*)$/i
    );

    const prefix = protocolMatch
      ? protocolMatch[ 1 ]
      : "";

    const initialPath = protocolMatch
      ? protocolMatch[ 2 ]
      : normalizedFirst;

    const parts = [
      initialPath,
      ...filtered.map((segment) =>
        segment.replace(/\\/g, "/")
      )
    ]
      .join("/")
      .split("/")
      .filter(Boolean);

    return prefix + parts.join("/");
  }

  normalizePath(path) {
    let value = String(path).replace(/\\/g, "/");

    const protocolMatch = value.match(
      /^([a-z][a-z0-9+.-]*:\/\/)(.*)$/i
    );

    if (protocolMatch) {
      const protocol = protocolMatch[ 1 ];
      const remainder = protocolMatch[ 2 ]
        .replace(/\/+/g, "/")
        .replace(/\/+$/, "");

      return protocol + remainder;
    }

    value = value
      .replace(/\/+/g, "/")
      .replace(/\/+$/, "");

    return value || "/";
  }

  validatePath(path) {
    if (
      typeof path !== "string" ||
      !path.trim()
    ) {
      throw new TypeError(
        "A valid filesystem path is required."
      );
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "FileSystemAdapter has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.fs = null;
    this.acode = null;
    this.destroyed = true;
  }
}
