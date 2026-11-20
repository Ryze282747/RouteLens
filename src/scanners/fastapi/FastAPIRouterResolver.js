export default class FastAPIRouterResolver {
  constructor({ fileSystem = null } = {}) {
    this.fileSystem = fileSystem;
    this.destroyed = false;
  }

  async resolve(routes, workspace) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    if (!workspace?.root) {
      throw new Error("A valid workspace is required.");
    }

    if (
      !this.fileSystem ||
      typeof this.fileSystem.readFile !== "function" ||
      typeof this.fileSystem.findFiles !== "function"
    ) {
      return routes;
    }

    const files = await this.discoverPythonFiles(workspace.root);
    const modules = await this.buildModuleIndex(files, workspace.root);

    const routerDefinitions = new Map();
    const imports = new Map();
    const includes = [];

    for (const [ file, module ] of modules) {
      this.ensureActive();

      const definitions = this.findRouterDefinitions(module.content, file);

      routerDefinitions.set(file, definitions);

      imports.set(
        file,
        this.findImports(module.content, module.moduleName)
      );

      includes.push(
        ...this.findIncludes(module.content, file)
      );
    }

    const resolvedIncludes = this.resolveIncludes(
      includes,
      modules,
      imports
    );

    const prefixes = this.resolvePrefixes(
      routerDefinitions,
      resolvedIncludes
    );

    return routes.map((route) => {
      this.ensureActive();

      const file = route?.file;
      const router = route?.metadata?.router;

      if (!file || !router) {
        return route;
      }

      const prefix = prefixes.get(
        this.createRouterKey(file, router)
      ) || "";

      if (!prefix) {
        return {
          ...route,
          metadata: {
            ...route.metadata,
            routerResolved: true,
            routerPrefix: ""
          }
        };
      }

      return {
        ...route,
        path: this.joinPaths(prefix, route.path),
        metadata: {
          ...route.metadata,
          routerResolved: true,
          routerPrefix: prefix
        }
      };
    });
  }

  async discoverPythonFiles(root) {
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
        "build"
      ],
      maxDepth: 30,
      maxFiles: 10000
    });
  }

  async buildModuleIndex(files, root) {
    const modules = new Map();

    for (const file of files) {
      this.ensureActive();

      let content;

      try {
        content = await this.fileSystem.readFile(file);
      } catch (error) {
        console.warn(
          `[RouteLens] Unable to read FastAPI module: ${file}`,
          error
        );

        continue;
      }

      if (typeof content !== "string") {
        continue;
      }

      const relativePath = this.fileSystem.getRelativePath(
        root,
        file
      );

      const moduleName = this.fileToModuleName(relativePath);

      modules.set(file, {
        file,
        content,
        relativePath,
        moduleName
      });
    }

    return modules;
  }

  fileToModuleName(filePath) {
    let value = String(filePath)
      .replace(/\\/g, "/")
      .replace(/\.py$/i, "")
      .replace(/\/+$/, "");

    if (value === "__init__") {
      return "";
    }

    if (value.endsWith("/__init__")) {
      value = value.slice(0, -11);
    }

    return value
      .split("/")
      .filter(Boolean)
      .join(".");
  }

  findRouterDefinitions(content, file) {
    const source = this.maskCommentsAndStrings(content);
    const definitions = new Map();

    const pattern =
      /^\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/gm;

    let match;

    while ((match = pattern.exec(source)) !== null) {
      const variable = match[ 1 ];
      const constructor = match[ 2 ].split(".").pop();

      if (
        constructor !== "APIRouter" &&
        constructor !== "FastAPI"
      ) {
        continue;
      }

      const openingIndex = source.indexOf(
        "(",
        match.index + match[ 0 ].length - 1
      );

      const closingIndex = this.findMatchingDelimiter(
        source,
        openingIndex,
        "(",
        ")"
      );

      if (closingIndex === -1) {
        continue;
      }

      const argumentsText = content.slice(
        openingIndex + 1,
        closingIndex
      );

      definitions.set(variable, {
        variable,
        type: constructor === "FastAPI" ? "app" : "router",
        prefix: this.extractKeywordString(
          argumentsText,
          "prefix"
        ),
        file
      });

      pattern.lastIndex = closingIndex + 1;
    }

    return definitions;
  }

  findImports(content, moduleName) {
    const source = this.maskCommentsAndStrings(content);
    const imports = new Map();

    const lines = source.split("\n");

    for (const line of lines) {
      this.ensureActive();

      const fromImport = line.match(
        /^\s*from\s+([.\w]+)\s+import\s+(.+)$/
      );

      if (fromImport) {
        const importedModule = this.resolveRelativeModule(
          fromImport[ 1 ],
          moduleName
        );

        const names = fromImport[ 2 ].split(",");

        for (const name of names) {
          const match = name.trim().match(
            /^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/
          );

          if (!match) {
            continue;
          }

          imports.set(match[ 2 ] || match[ 1 ], {
            module: importedModule,
            name: match[ 1 ]
          });
        }

        continue;
      }

      const importStatement = line.match(
        /^\s*import\s+([\w.]+)(?:\s+as\s+([A-Za-z_]\w*))?/
      );

      if (importStatement) {
        const importedModule = importStatement[ 1 ];
        const alias = importStatement[ 2 ] ||
          importedModule.split(".")[ 0 ];

        imports.set(alias, {
          module: importedModule,
          name: null
        });
      }
    }

    return imports;
  }

  resolveRelativeModule(importedModule, currentModule) {
    if (!importedModule.startsWith(".")) {
      return importedModule;
    }

    const level = importedModule.match(/^\.+/)[ 0 ].length;
    const remainder = importedModule.slice(level);

    const parts = currentModule
      ? currentModule.split(".")
      : [];

    if (parts.length > 0) {
      parts.pop();
    }

    for (let index = 1; index < level; index++) {
      parts.pop();
    }

    if (remainder) {
      parts.push(...remainder.split("."));
    }

    return parts.join(".");
  }

  findIncludes(content, file) {
    const source = this.maskCommentsAndStrings(content);
    const includes = [];

    const pattern =
      /([A-Za-z_]\w*)\s*\.\s*include_router\s*\(/g;

    let match;

    while ((match = pattern.exec(source)) !== null) {
      const parent = match[ 1 ];

      const openingIndex = source.indexOf(
        "(",
        match.index + match[ 0 ].length - 1
      );

      const closingIndex = this.findMatchingDelimiter(
        source,
        openingIndex,
        "(",
        ")"
      );

      if (closingIndex === -1) {
        continue;
      }

      const argumentsText = content.slice(
        openingIndex + 1,
        closingIndex
      );

      const childMatch = argumentsText.match(
        /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/
      );

      if (!childMatch) {
        continue;
      }

      includes.push({
        file,
        parent,
        childExpression: childMatch[ 1 ],
        prefix: this.extractKeywordString(
          argumentsText,
          "prefix"
        ),
        line: this.getLineNumber(content, match.index)
      });

      pattern.lastIndex = closingIndex + 1;
    }

    return includes;
  }

  resolveIncludes(includes, modules, imports) {
    const resolved = [];

    for (const include of includes) {
      this.ensureActive();

      const parentDefinitions = modules.get(include.file);

      if (!parentDefinitions) {
        continue;
      }

      const importMap = imports.get(include.file) ||
        new Map();

      const expressionParts = include.childExpression.split(".");
      const firstPart = expressionParts[ 0 ];

      let childFile = include.file;
      let childRouter = firstPart;

      const imported = importMap.get(firstPart);

      if (imported) {
        const moduleFile = this.findModuleFile(
          imported.module,
          modules
        );

        if (moduleFile) {
          childFile = moduleFile;

          if (imported.name) {
            childRouter = imported.name;
          } else if (expressionParts.length > 1) {
            childRouter = expressionParts[ 1 ];
          } else {
            continue;
          }
        }
      }

      if (expressionParts.length > 1 && !imported) {
        continue;
      }

      resolved.push({
        parentFile: include.file,
        parentRouter: include.parent,
        childFile,
        childRouter,
        prefix: include.prefix
      });
    }

    return resolved;
  }

  findModuleFile(moduleName, modules) {
    for (const [ file, module ] of modules) {
      if (module.moduleName === moduleName) {
        return file;
      }

      if (
        module.moduleName.endsWith(`.${moduleName}`) ||
        module.moduleName === `${moduleName}.__init__`
      ) {
        return file;
      }
    }

    return null;
  }

  resolvePrefixes(definitions, includes) {
    const prefixes = new Map();
    const visiting = new Set();

    const resolve = (file, router) => {
      const key = this.createRouterKey(file, router);

      if (prefixes.has(key)) {
        return prefixes.get(key);
      }

      if (visiting.has(key)) {
        return "";
      }

      visiting.add(key);

      const definition = definitions
        .get(file)
        ?.get(router);

      if (!definition) {
        visiting.delete(key);
        return "";
      }

      let prefix = definition.prefix || "";

      const parentInclude = includes.find(
        (include) =>
          include.childFile === file &&
          include.childRouter === router
      );

      if (parentInclude) {
        const parentPrefix = resolve(
          parentInclude.parentFile,
          parentInclude.parentRouter
        );

        prefix = this.joinPaths(
          parentPrefix,
          parentInclude.prefix,
          prefix
        );
      }

      visiting.delete(key);
      prefixes.set(key, prefix);

      return prefix;
    };

    for (const [ file, routers ] of definitions) {
      for (const router of routers.keys()) {
        this.ensureActive();
        resolve(file, router);
      }
    }

    return prefixes;
  }

  extractKeywordString(argumentsText, keyword) {
    if (typeof argumentsText !== "string") {
      return "";
    }

    const escaped = keyword.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const pattern = new RegExp(
      `\\b${escaped}\\s*=\\s*(['"])(.*?)\\1`,
      "s"
    );

    return argumentsText.match(pattern)?.[ 2 ] || "";
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

  findMatchingDelimiter(content, openingIndex, open, close) {
    let depth = 0;

    for (
      let index = openingIndex;
      index < content.length;
      index++
    ) {
      if (content[ index ] === open) {
        depth++;
      } else if (content[ index ] === close) {
        depth--;

        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  createRouterKey(file, router) {
    return `${file}::${router}`;
  }

  joinPaths(...segments) {
    const parts = segments
      .filter(
        (segment) =>
          typeof segment === "string" &&
          segment.trim() !== ""
      )
      .map((segment) => segment.trim())
      .map((segment) =>
        segment.replace(/^\/+|\/+$/g, "")
      )
      .filter(Boolean);

    return parts.length
      ? `/${parts.join("/")}`
      : "";
  }

  getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "FastAPIRouterResolver has been destroyed."
      );
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
