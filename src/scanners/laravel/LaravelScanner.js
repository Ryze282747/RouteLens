import BaseScanner from "../BaseScanner.js";
import LaravelRouteParser from "./LaravelRouteParser.js";
import LaravelGroupResolver from "./LaravelGroupResolver.js";

export default class LaravelScanner extends BaseScanner {
  constructor({
    fileSystem,
    parser,
    groupResolver
  } = {}) {
    super({
      id: "laravel",
      name: "Laravel Scanner",
      framework: "laravel",
      extensions: [ ".php" ]
    });

    if (!fileSystem) {
      throw new Error(
        "LaravelScanner requires a FileSystemAdapter."
      );
    }

    this.fileSystem = fileSystem;

    this.ownsParser = !parser;
    this.ownsGroupResolver = !groupResolver;

    this.parser = parser || new LaravelRouteParser();

    this.groupResolver = groupResolver ||
      new LaravelGroupResolver({
        fileSystem
      });
  }

  async detect(workspace) {
    this.ensureActive();

    if (!workspace?.root) {
      return false;
    }

    let files;

    try {
      files = await this.fileSystem.findFiles(
        workspace.root,
        {
          extensions: this.extensions,
          exclude: [
            "vendor",
            "node_modules",
            ".git",
            "storage",
            "bootstrap/cache"
          ]
        }
      );
    } catch (error) {
      this.ensureActive();

      console.error(
        "[RouteLens] Laravel project detection failed:",
        error
      );

      return false;
    }

    this.ensureActive();

    if (!Array.isArray(files) || files.length === 0) {
      return false;
    }

    for (const file of files) {
      this.ensureActive();

      try {
        const content = await this.fileSystem.readFile(file);

        if (
          typeof content === "string" &&
          this.containsLaravelReference(content)
        ) {
          return true;
        }
      } catch (error) {
        this.ensureActive();

        console.error(
          `[RouteLens] Failed to inspect PHP file: ${file}`,
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
          "vendor",
          "node_modules",
          ".git",
          "storage",
          "bootstrap/cache"
        ]
      }
    );

    this.ensureActive();

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

        if (!this.isPotentialRouteFile(file, content)) {
          continue;
        }

        const routes = await this.parser.parse(content, {
          file,
          workspace
        });

        this.ensureActive();

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
        this.ensureActive();

        console.error(
          `[RouteLens] Failed to scan Laravel file: ${file}`,
          error
        );
      }
    }

    this.ensureActive();

    const resolvedRoutes =
      await this.groupResolver.resolve(
        discoveredRoutes,
        workspace
      );

    this.ensureActive();

    return Array.isArray(resolvedRoutes)
      ? resolvedRoutes
      : discoveredRoutes;
  }

  isPotentialRouteFile(file, content) {
    const normalizedPath =
      typeof file === "string"
        ? file.replace(/\\/g, "/")
        : "";

    const isRoutesDirectoryFile =
      /(^|\/)routes\/[^/]+\.php$/i.test(normalizedPath);

    const hasRouteDeclaration =
      /\bRoute\s*::\s*(get|post|put|patch|delete|options|any|match|resource|apiResource)\s*\(/i.test(
        content
      );

    const hasRouteGroup =
      /\bRoute\s*::\s*group\s*\(/i.test(content);

    return (
      (isRoutesDirectoryFile &&
        this.containsLaravelReference(content)) ||
      hasRouteDeclaration ||
      hasRouteGroup
    );
  }

  containsLaravelReference(content) {
    if (typeof content !== "string") {
      return false;
    }

    return (
      /\buse\s+Illuminate\\Support\\Facades\\Route\b/i.test(content) ||
      /\bRoute\s*::/i.test(content) ||
      /\bIlluminate\\Foundation\\Application\b/i.test(content) ||
      /\bApplication::configure\s*\(/i.test(content)
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
      this.ownsGroupResolver &&
      this.groupResolver &&
      typeof this.groupResolver.destroy === "function"
    ) {
      this.groupResolver.destroy();
    }

    this.parser = null;
    this.groupResolver = null;
    this.fileSystem = null;

    super.destroy();
  }
}
