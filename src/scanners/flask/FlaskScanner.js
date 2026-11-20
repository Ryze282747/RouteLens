import BaseScanner from "../BaseScanner.js";
import FlaskRouteParser from "./FlaskRouteParser.js";
import FlaskBlueprintResolver from "./FlaskBlueprintResolver.js";

export default class FlaskScanner extends BaseScanner {
  constructor({
    fileSystem,
    parser = null,
    blueprintResolver = null
  } = {}) {
    super({
      id: "flask",
      name: "Flask Scanner",
      framework: "flask",
      extensions: [ ".py" ]
    });

    if (!fileSystem) {
      throw new Error("FlaskScanner requires a FileSystemAdapter.");
    }

    if (
      typeof fileSystem.findFiles !== "function" ||
      typeof fileSystem.readFile !== "function"
    ) {
      throw new TypeError(
        "FileSystemAdapter must implement findFiles() and readFile()."
      );
    }

    this.fileSystem = fileSystem;

    this.ownsParser = parser === null;
    this.ownsBlueprintResolver = blueprintResolver === null;

    this.parser = parser || new FlaskRouteParser();

    this.blueprintResolver =
      blueprintResolver ||
      new FlaskBlueprintResolver({
        fileSystem
      });

    if (typeof this.parser.parse !== "function") {
      throw new TypeError(
        "FlaskRouteParser must implement parse()."
      );
    }

    if (typeof this.blueprintResolver.resolve !== "function") {
      throw new TypeError(
        "FlaskBlueprintResolver must implement resolve()."
      );
    }
  }

  async detect(workspace) {
    this.ensureActive();

    if (
      !workspace ||
      typeof workspace.root !== "string" ||
      !workspace.root.trim()
    ) {
      return false;
    }

    const files = await this.fileSystem.findFiles(
      workspace.root,
      {
        extensions: [ ".py" ],
        exclude: [
          "node_modules",
          ".git",
          "venv",
          ".venv",
          "__pycache__"
        ]
      }
    );

    this.ensureActive();

    if (!Array.isArray(files) || files.length === 0) {
      return false;
    }

    for (const file of files) {
      this.ensureActive();

      if (typeof file !== "string" || !file.trim()) {
        continue;
      }

      const content = await this.fileSystem.readFile(file);

      this.ensureActive();

      if (
        typeof content === "string" &&
        this.containsFlaskReference(content)
      ) {
        return true;
      }
    }

    return false;
  }

  async scan(workspace, options = {}) {
    this.ensureActive();

    if (
      !workspace ||
      typeof workspace.root !== "string" ||
      !workspace.root.trim()
    ) {
      throw new Error("A valid workspace is required.");
    }

    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options)
    ) {
      throw new TypeError("Scan options must be an object.");
    }

    const files = await this.fileSystem.findFiles(
      workspace.root,
      {
        extensions: [ ".py" ],
        exclude: Array.isArray(options.exclude)
          ? options.exclude
          : [
            "node_modules",
            ".git",
            "venv",
            ".venv",
            "__pycache__"
          ]
      }
    );

    this.ensureActive();

    if (!Array.isArray(files)) {
      throw new TypeError(
        "FileSystemAdapter.findFiles() must return an array."
      );
    }

    const discoveredRoutes = [];

    for (const file of files) {
      this.ensureActive();

      if (typeof file !== "string" || !file.trim()) {
        continue;
      }

      try {
        const content = await this.fileSystem.readFile(file);

        this.ensureActive();

        if (typeof content !== "string") {
          continue;
        }

        const routes = await this.parser.parse(content, {
          file,
          workspace
        });

        this.ensureActive();

        if (!Array.isArray(routes)) {
          continue;
        }

        for (const route of routes) {
          discoveredRoutes.push(
            this.createRoute({
              ...route,
              file
            })
          );
        }
      } catch (error) {
        this.ensureActive();

        console.error(
          `[RouteLens] Failed to scan Flask file: ${file}`,
          error
        );
      }
    }

    this.ensureActive();

    const resolvedRoutes = await this.blueprintResolver.resolve(
      discoveredRoutes,
      workspace
    );

    this.ensureActive();

    return Array.isArray(resolvedRoutes)
      ? resolvedRoutes
      : discoveredRoutes;
  }

  containsFlaskReference(content) {
    if (typeof content !== "string" || !content.trim()) {
      return false;
    }

    return (
      /\bfrom\s+flask\s+import\b/.test(content) ||
      /\bimport\s+flask\b/.test(content) ||
      /\bFlask\s*\(/.test(content) ||
      /\bBlueprint\s*\(/.test(content)
    );
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    if (
      this.ownsParser &&
      this.parser &&
      typeof this.parser.destroy === "function"
    ) {
      try {
        this.parser.destroy();
      } catch (error) {
        console.error(
          "[RouteLens] Flask parser cleanup failed:",
          error
        );
      }
    }

    if (
      this.ownsBlueprintResolver &&
      this.blueprintResolver &&
      typeof this.blueprintResolver.destroy === "function"
    ) {
      try {
        this.blueprintResolver.destroy();
      } catch (error) {
        console.error(
          "[RouteLens] Flask blueprint resolver cleanup failed:",
          error
        );
      }
    }

    this.parser = null;
    this.blueprintResolver = null;
    this.fileSystem = null;

    this.ownsParser = false;
    this.ownsBlueprintResolver = false;

    super.destroy();
  }
}
