import BaseScanner from "../BaseScanner.js";
import FastAPIRouteParser from "./FastAPIRouteParser.js";
import FastAPIRouterResolver from "./FastAPIRouterResolver.js";

export default class FastAPIScanner extends BaseScanner {
  constructor({
    fileSystem,
    parser = null,
    routerResolver = null
  } = {}) {
    super({
      id: "fastapi",
      name: "FastAPI Scanner",
      framework: "fastapi",
      extensions: [ ".py" ]
    });

    if (
      !fileSystem ||
      typeof fileSystem.findFiles !== "function" ||
      typeof fileSystem.readFile !== "function"
    ) {
      throw new TypeError(
        "FastAPI Scanner requires a valid filesystem adapter."
      );
    }

    this.fileSystem = fileSystem;

    this.parser = parser || new FastAPIRouteParser();
    this.ownsParser = !parser;

    this.routerResolver =
      routerResolver ||
      new FastAPIRouterResolver({ fileSystem });

    this.ownsRouterResolver = !routerResolver;
  }

  async detect(workspace) {
    this.ensureActive();

    if (!workspace?.root) {
      return false;
    }

    const files = await this.findPythonFiles(workspace.root);

    for (const file of files) {
      this.ensureActive();

      let content;

      try {
        content = await this.fileSystem.readFile(file);
      } catch (error) {
        console.warn(
          `[RouteLens] Unable to inspect Python file: ${file}`,
          error
        );

        continue;
      }

      if (
        typeof content === "string" &&
        this.containsFastAPIReference(content)
      ) {
        return true;
      }
    }

    return false;
  }

  async scan(workspace, options = {}) {
    this.ensureActive();

    if (!workspace?.root) {
      throw new Error(
        "A valid workspace is required for FastAPI scanning."
      );
    }

    const files = await this.findPythonFiles(
      workspace.root,
      options
    );

    const discoveredRoutes = [];

    for (const file of files) {
      this.ensureActive();

      let content;

      try {
        content = await this.fileSystem.readFile(file);
      } catch (error) {
        console.warn(
          `[RouteLens] Unable to scan FastAPI file: ${file}`,
          error
        );

        continue;
      }

      if (typeof content !== "string" || !content.trim()) {
        continue;
      }

      const routes = this.parser.parse(content, {
        file,
        workspace
      });

      for (const route of routes) {
        this.ensureActive();

        discoveredRoutes.push(
          this.createRoute({
            ...route,
            file
          })
        );
      }
    }

    this.ensureActive();

    const resolvedRoutes =
      await this.routerResolver.resolve(
        discoveredRoutes,
        workspace
      );

    this.ensureActive();

    return resolvedRoutes;
  }

  async findPythonFiles(root, options = {}) {
    this.ensureActive();

    return this.fileSystem.findFiles(root, {
      extensions: [ ".py" ],
      exclude: [
        ".git",
        ".venv",
        "venv",
        "env",
        "__pycache__",
        "site-packages",
        "node_modules",
        "dist",
        "build",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache"
      ],
      maxDepth: Number.isInteger(options.maxDepth)
        ? options.maxDepth
        : 30,
      maxFiles: Number.isInteger(options.maxFiles)
        ? options.maxFiles
        : 10000,
      maxFileSize: options.maxFileSize
    });
  }

  containsFastAPIReference(content) {
    if (typeof content !== "string") {
      return false;
    }

    const source = this.maskCommentsAndStrings(content);

    const importsFastAPI =
      /\bfrom\s+fastapi\s+import\b/.test(source);

    const importsFastAPIModule =
      /\bimport\s+fastapi\b/.test(source);

    if (!importsFastAPI && !importsFastAPIModule) {
      return false;
    }

    const importedNames = new Set();

    const fromImportPattern =
      /\bfrom\s+fastapi\s+import\s+([^\n]+)/g;

    let match;

    while (
      (match = fromImportPattern.exec(source)) !== null
    ) {
      const names = match[ 1 ].split(",");

      for (const name of names) {
        const imported = name.trim().match(
          /^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?/
        );

        if (!imported) {
          continue;
        }

        if (
          imported[ 1 ] === "FastAPI" ||
          imported[ 1 ] === "APIRouter"
        ) {
          importedNames.add(
            imported[ 2 ] || imported[ 1 ]
          );
        }
      }
    }

    const moduleAliases = new Set();

    const moduleImportPattern =
      /\bimport\s+fastapi(?:\s+as\s+([A-Za-z_]\w*))?/g;

    while (
      (match = moduleImportPattern.exec(source)) !== null
    ) {
      moduleAliases.add(match[ 1 ] || "fastapi");
    }

    for (const name of importedNames) {
      const constructorPattern = new RegExp(
        `\\b${this.escapeRegExp(name)}\\s*\\(`
      );

      if (constructorPattern.test(source)) {
        return true;
      }
    }

    for (const alias of moduleAliases) {
      const constructorPattern = new RegExp(
        `\\b${this.escapeRegExp(alias)}\\s*\\.\\s*(?:FastAPI|APIRouter)\\s*\\(`
      );

      if (constructorPattern.test(source)) {
        return true;
      }
    }

    return false;
  }

  maskCommentsAndStrings(content) {
    const characters = content.split("");
    let index = 0;

    while (index < content.length) {
      const character = content[ index ];

      if (character === "#") {
        while (
          index < content.length &&
          content[ index ] !== "\n"
        ) {
          characters[ index ] = " ";
          index++;
        }

        continue;
      }

      if (character === "'" || character === '"') {
        const triple =
          content.slice(index, index + 3) === character.repeat(3);

        const delimiter = triple
          ? character.repeat(3)
          : character;

        const start = index;
        index += delimiter.length;

        while (index < content.length) {
          if (content[ index ] === "\\") {
            index += 2;
            continue;
          }

          if (
            content.slice(
              index,
              index + delimiter.length
            ) === delimiter
          ) {
            index += delimiter.length;
            break;
          }

          index++;
        }

        for (let position = start; position < index; position++) {
          if (characters[ position ] !== "\n") {
            characters[ position ] = " ";
          }
        }

        continue;
      }

      index++;
    }

    return characters.join("");
  }

  escapeRegExp(value) {
    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  }

  ensureActive() {
    super.ensureActive();

    if (
      !this.fileSystem ||
      !this.parser ||
      !this.routerResolver
    ) {
      throw new Error(
        "FastAPI Scanner dependencies are unavailable."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    if (this.ownsParser) {
      this.parser?.destroy();
    }

    if (this.ownsRouterResolver) {
      this.routerResolver?.destroy();
    }

    this.parser = null;
    this.routerResolver = null;
    this.fileSystem = null;

    super.destroy();
  }
}
