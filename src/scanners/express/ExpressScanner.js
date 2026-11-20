
import BaseScanner from "../BaseScanner.js";
import ExpressRouteParser from "./ExpressRouteParser.js";
import ExpressRouterResolver from "./ExpressRouterResolver.js";

export default class ExpressScanner extends BaseScanner {
  constructor({
    fileSystem,
    parser,
    routerResolver
  } = {}) {
    super({
      id: "express",
      name: "Express Scanner",
      framework: "express",
      extensions: [
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".mjs",
        ".cjs"
      ]
    });

    if (!fileSystem) {
      throw new Error(
        "ExpressScanner requires a FileSystemAdapter."
      );
    }

    this.fileSystem = fileSystem;

    this.ownsParser = !parser;
    this.ownsRouterResolver = !routerResolver;

    this.parser = parser || new ExpressRouteParser();

    this.routerResolver = routerResolver ||
      new ExpressRouterResolver({
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
          this.containsExpressReference(content)
        ) {
          return true;
        }
      } catch (error) {
        console.error(
          `[RouteLens] Failed to inspect Express file: ${file}`,
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
          `[RouteLens] Failed to scan Express file: ${file}`,
          error
        );
      }
    }

    this.ensureActive();

    const resolvedRoutes =
      await this.routerResolver.resolve(
        discoveredRoutes,
        workspace
      );

    return Array.isArray(resolvedRoutes)
      ? resolvedRoutes
      : discoveredRoutes;
  }

  containsExpressReference(content) {
    return (
      /\bfrom\s*["']express["']/.test(content) ||
      /\brequire\s*\(\s*["']express["']\s*\)/.test(content) ||
      /\bexpress\s*\(\s*\)/.test(content) ||
      /\bexpress\.Router\s*\(/.test(content)
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
      this.ownsRouterResolver &&
      this.routerResolver &&
      typeof this.routerResolver.destroy === "function"
    ) {
      this.routerResolver.destroy();
    }

    this.parser = null;
    this.routerResolver = null;
    this.fileSystem = null;

    super.destroy();
  }
}
