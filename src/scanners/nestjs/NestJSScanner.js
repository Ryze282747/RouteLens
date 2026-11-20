
import BaseScanner from "../BaseScanner.js";
import NestJSRouteParser from "./NestJSRouteParser.js";
import NestJSControllerResolver from "./NestJSControllerResolver.js";

export default class NestJSScanner extends BaseScanner {
  constructor({
    fileSystem,
    parser,
    controllerResolver
  } = {}) {
    super({
      id: "nestjs",
      name: "NestJS Scanner",
      framework: "nestjs",
      extensions: [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs"
      ]
    });

    if (!fileSystem) {
      throw new Error(
        "NestJSScanner requires a FileSystemAdapter."
      );
    }

    this.fileSystem = fileSystem;

    this.ownsParser = !parser;
    this.ownsControllerResolver = !controllerResolver;

    this.parser = parser || new NestJSRouteParser();

    this.controllerResolver = controllerResolver ||
      new NestJSControllerResolver({
        fileSystem
      });
  }

  async detect(workspace) {
    this.ensureActive();

    if (!workspace?.root) {
      return false;
    }

    const files = await this.fileSystem.findFiles(
      workspace.root,
      {
        extensions: this.extensions,
        exclude: [
          "node_modules",
          ".git",
          "dist",
          "build",
          "coverage"
        ]
      }
    );

    if (!Array.isArray(files) || files.length === 0) {
      return false;
    }

    for (const file of files) {
      this.ensureActive();

      try {
        const content = await this.fileSystem.readFile(file);

        if (
          typeof content === "string" &&
          this.containsNestJSReference(content)
        ) {
          return true;
        }
      } catch (error) {
        console.error(
          `[RouteLens] Failed to inspect NestJS file: ${file}`,
          error
        );
      }
    }

    return false;
  }

  async scan(workspace, options = {}) {
    this.ensureActive();

    if (!workspace?.root) {
      throw new Error("A valid workspace is required.");
    }

    const files = await this.fileSystem.findFiles(
      workspace.root,
      {
        extensions: this.extensions,
        exclude: options.exclude || [
          "node_modules",
          ".git",
          "dist",
          "build",
          "coverage"
        ]
      }
    );

    if (!Array.isArray(files)) {
      return [];
    }

    const discoveredRoutes = [];

    for (const file of files) {
      this.ensureActive();

      try {
        const content = await this.fileSystem.readFile(file);

        if (typeof content !== "string") {
          continue;
        }

        const routes = await this.parser.parse(content, {
          file,
          workspace
        });

        if (Array.isArray(routes)) {
          discoveredRoutes.push(
            ...routes.map((route) =>
              this.createRoute({
                ...route,
                file
              })
            )
          );
        }
      } catch (error) {
        console.error(
          `[RouteLens] Failed to scan NestJS file: ${file}`,
          error
        );
      }
    }

    this.ensureActive();

    const resolvedRoutes =
      await this.controllerResolver.resolve(
        discoveredRoutes,
        workspace
      );

    return Array.isArray(resolvedRoutes)
      ? resolvedRoutes
      : discoveredRoutes;
  }

  containsNestJSReference(content) {
    return (
      /\bfrom\s*["']@nestjs\/common["']/.test(content) ||
      /\brequire\s*\(\s*["']@nestjs\/common["']\s*\)/.test(content) ||
      /@Controller\s*(?:\(|\b)/.test(content) ||
      /@Module\s*\(/.test(content)
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
      this.parser.destroy();
    }

    if (
      this.ownsControllerResolver &&
      this.controllerResolver &&
      typeof this.controllerResolver.destroy === "function"
    ) {
      this.controllerResolver.destroy();
    }

    this.parser = null;
    this.controllerResolver = null;
    this.fileSystem = null;

    super.destroy();
  }
}
