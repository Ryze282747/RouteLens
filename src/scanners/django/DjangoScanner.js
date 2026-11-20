import BaseScanner from "../BaseScanner.js";
import DjangoRouteParser from "./DjangoRouteParser.js";
import DjangoURLResolver from "./DjangoURLResolver.js";

export default class DjangoScanner extends BaseScanner {
  constructor({
    fileSystem,
    parser = null,
    urlResolver = null
  } = {}) {
    super({
      id: "django",
      name: "Django Scanner",
      framework: "django",
      extensions: [ ".py" ]
    });

    if (
      !fileSystem ||
      typeof fileSystem.findFiles !== "function" ||
      typeof fileSystem.readFile !== "function"
    ) {
      throw new TypeError(
        "Django Scanner requires a valid filesystem adapter."
      );
    }

    this.fileSystem = fileSystem;

    this.parser = parser || new DjangoRouteParser();
    this.ownsParser = !parser;

    this.urlResolver =
      urlResolver ||
      new DjangoURLResolver({ fileSystem });

    this.ownsURLResolver = !urlResolver;
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
          `[RouteLens] Unable to inspect Django file: ${file}`,
          error
        );

        continue;
      }

      if (
        typeof content === "string" &&
        this.containsDjangoURLConfiguration(content)
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
        "A valid workspace is required for Django scanning."
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
          `[RouteLens] Unable to scan Django file: ${file}`,
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
      await this.urlResolver.resolve(
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

  containsDjangoURLConfiguration(content) {
    if (typeof content !== "string") {
      return false;
    }

    const source = this.maskCommentsAndStrings(content);

    const importsDjangoURLs =
      /\bfrom\s+django\.urls\s+import\b/.test(source);

    const importsLegacyDjangoURLs =
      /\bfrom\s+django\.conf\.urls\s+import\b/.test(source);

    if (
      !importsDjangoURLs &&
      !importsLegacyDjangoURLs
    ) {
      return false;
    }

    const importedNames = new Set();

    const importPattern =
      /\bfrom\s+django\.(?:urls|conf\.urls)\s+import\s+([^\n]+)/g;

    let match;

    while (
      (match = importPattern.exec(source)) !== null
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
          [ "path", "re_path", "url", "include" ].includes(
            imported[ 1 ]
          )
        ) {
          importedNames.add(
            imported[ 2 ] || imported[ 1 ]
          );
        }
      }
    }

    const hasURLPatterns =
      /\burlpatterns\s*=/.test(source);

    if (!hasURLPatterns) {
      return false;
    }

    for (const name of importedNames) {
      const callPattern = new RegExp(
        `\\b${this.escapeRegExp(name)}\\s*\\(`
      );

      if (callPattern.test(source)) {
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
          content.slice(index, index + 3) ===
          character.repeat(3);

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

        for (
          let position = start;
          position < index;
          position++
        ) {
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
      !this.urlResolver
    ) {
      throw new Error(
        "Django Scanner dependencies are unavailable."
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

    if (this.ownsURLResolver) {
      this.urlResolver?.destroy();
    }

    this.parser = null;
    this.urlResolver = null;
    this.fileSystem = null;

    super.destroy();
  }
}
