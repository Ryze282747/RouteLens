
import PathUtils from "./PathUtils.js";

export default class FileUtils {
  constructor(fileSystem) {
    if (!fileSystem) {
      throw new TypeError(
        "FileUtils requires a filesystem adapter."
      );
    }

    this.fileSystem = fileSystem;
    this.destroyed = false;
  }

  async exists(filePath) {
    this.ensureActive();
    this.validatePath(filePath);

    try {
      return await this.fileSystem.exists(filePath);
    } catch {
      return false;
    }
  }

  async isFile(filePath) {
    this.ensureActive();
    this.validatePath(filePath);

    try {
      const stats = await this.fileSystem.stat(filePath);
      return Boolean(stats && !stats.isDirectory);
    } catch {
      return false;
    }
  }

  async isDirectory(directoryPath) {
    this.ensureActive();
    this.validatePath(directoryPath);

    try {
      const stats = await this.fileSystem.stat(directoryPath);
      return Boolean(stats && stats.isDirectory);
    } catch {
      return false;
    }
  }

  async readFile(filePath, options = {}) {
    this.ensureActive();
    this.validatePath(filePath);

    const {
      encoding = "utf8",
      maxSize = Infinity
    } = options;

    try {
      const stats = await this.fileSystem.stat(filePath);

      if (stats?.size > maxSize) {
        throw new Error(
          `File exceeds the maximum allowed size: ${filePath}`
        );
      }

      const content = await this.fileSystem.readFile(
        filePath,
        encoding
      );

      if (content === null || content === undefined) {
        throw new Error(
          `Unable to read file: ${filePath}`
        );
      }

      return typeof content === "string"
        ? content
        : String(content);
    } catch (error) {
      if (error.message?.startsWith("File exceeds")) {
        throw error;
      }

      throw new Error(
        `Failed to read "${filePath}": ${error.message || error}`
      );
    }
  }

  async readJSON(filePath, options = {}) {
    const content = await this.readFile(filePath, options);

    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Invalid JSON in "${filePath}": ${error.message}`
      );
    }
  }

  async readLines(filePath, options = {}) {
    const content = await this.readFile(filePath, options);

    return content.split(/\r?\n/);
  }

  async findFiles(directoryPath, options = {}) {
    this.ensureActive();
    this.validatePath(directoryPath);

    const {
      extensions = [],
      exclude = [],
      maxDepth = 20,
      maxFiles = 10000,
      maxFileSize = Infinity
    } = options;

    if (
      !Array.isArray(extensions) ||
      !Array.isArray(exclude)
    ) {
      throw new TypeError(
        "Extensions and exclude must be arrays."
      );
    }

    if (
      !Number.isInteger(maxDepth) ||
      maxDepth < 0 ||
      !Number.isInteger(maxFiles) ||
      maxFiles < 1
    ) {
      throw new TypeError(
        "Invalid file discovery limits."
      );
    }

    const normalizedExtensions = extensions.map(extension =>
      extension.startsWith(".")
        ? extension.toLowerCase()
        : `.${extension.toLowerCase()}`
    );

    const excludedNames = new Set(
      exclude.map(name => String(name).toLowerCase())
    );

    const results = [];
    const visited = new Set();

    const walk = async (currentPath, depth) => {
      if (depth > maxDepth || results.length >= maxFiles) {
        return;
      }

      const normalizedPath = PathUtils.normalizePath(currentPath);
      const visitKey = normalizedPath.toLowerCase();

      if (visited.has(visitKey)) {
        return;
      }

      visited.add(visitKey);

      let entries;

      try {
        entries = await this.fileSystem.readDirectory(
          normalizedPath
        );
      } catch {
        return;
      }

      if (!Array.isArray(entries)) {
        return;
      }

      for (const entry of entries) {
        if (results.length >= maxFiles) {
          break;
        }

        const name =
          typeof entry === "string"
            ? entry
            : entry?.name;

        if (!name || typeof name !== "string") {
          continue;
        }

        if (excludedNames.has(name.toLowerCase())) {
          continue;
        }

        const entryPath = PathUtils.joinPaths(
          normalizedPath,
          name
        );

        let directory =
          typeof entry === "object" &&
            typeof entry.isDirectory === "boolean"
            ? entry.isDirectory
            : null;

        let stats = null;

        if (directory === null) {
          try {
            stats = await this.fileSystem.stat(entryPath);
            directory = Boolean(stats?.isDirectory);
          } catch {
            continue;
          }
        }

        if (directory) {
          await walk(entryPath, depth + 1);
          continue;
        }

        const extension = PathUtils.extname(name).toLowerCase();

        if (
          normalizedExtensions.length > 0 &&
          !normalizedExtensions.includes(extension)
        ) {
          continue;
        }

        if (!stats) {
          try {
            stats = await this.fileSystem.stat(entryPath);
          } catch {
            continue;
          }
        }

        if (
          typeof stats?.size === "number" &&
          stats.size > maxFileSize
        ) {
          continue;
        }

        results.push(entryPath);
      }
    };

    await walk(directoryPath, 0);

    return results;
  }

  async getFileSize(filePath) {
    this.ensureActive();
    this.validatePath(filePath);

    const stats = await this.fileSystem.stat(filePath);

    if (!stats || typeof stats.size !== "number") {
      return null;
    }

    return stats.size;
  }

  async getLastModified(filePath) {
    this.ensureActive();
    this.validatePath(filePath);

    const stats = await this.fileSystem.stat(filePath);

    return stats?.mtime ?? stats?.lastModified ?? null;
  }

  validatePath(filePath) {
    if (
      typeof filePath !== "string" ||
      !filePath.trim()
    ) {
      throw new TypeError("A valid file path is required.");
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("FileUtils has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.fileSystem = null;
    this.destroyed = true;
  }
}
