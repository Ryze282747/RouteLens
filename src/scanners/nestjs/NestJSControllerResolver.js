export default class NestJSControllerResolver {
  constructor({ fileSystem } = {}) {
    if (!fileSystem) {
      throw new Error(
        "NestJSControllerResolver requires a FileSystemAdapter."
      );
    }

    this.fileSystem = fileSystem;
    this.destroyed = false;

    this.extensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mts",
      ".cts",
      ".mjs",
      ".cjs"
    ];

    this.excludedDirectories = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage"
    ];

    this._fileSet = null;
  }

  async resolve(routes, workspace) {
    this.ensureActive();

    if (!Array.isArray(routes) || routes.length === 0) {
      return [];
    }

    if (!workspace?.root) {
      return routes;
    }

    const files = await this.fileSystem.findFiles(
      workspace.root,
      {
        extensions: this.extensions,
        exclude: this.excludedDirectories
      }
    );

    this.ensureActive();

    if (!Array.isArray(files) || files.length === 0) {
      return routes;
    }

    const fileSet = new Set(files);
    const modules = new Map();

    this._fileSet = fileSet;

    for (const file of files) {
      this.ensureActive();

      try {
        const content = await this.fileSystem.readFile(file);

        if (typeof content !== "string") {
          continue;
        }

        modules.set(file, {
          file,
          content,
          mask: this.createCodeMask(content),
          controllers: new Set(),
          imports: new Map(),
          exports: new Map(),
          moduleRegistrations: []
        });
      } catch (error) {
        console.error(
          `[RouteLens] Failed to read NestJS module: ${file}`,
          error
        );
      }
    }

    this.ensureActive();

    for (const module of modules.values()) {
      this.collectControllers(module);
      this.collectImports(module);
      this.collectExports(module);
    }

    for (const module of modules.values()) {
      this.collectModuleRegistrations(module);
    }

    const globalPrefix = this.findGlobalPrefix(modules);

    return this.applyControllerPrefixes(
      routes,
      modules,
      globalPrefix
    );
  }

  findGlobalPrefix(modules) {
    for (const module of modules.values()) {
      this.ensureActive();

      const pattern = /\bsetGlobalPrefix\s*\(/g;
      let match;

      while ((match = pattern.exec(module.mask)) !== null) {
        const openingIndex = module.mask.indexOf(
          "(",
          match.index
        );

        const closingIndex = this.findClosingDelimiter(
          module.mask,
          openingIndex,
          "(",
          ")"
        );

        if (closingIndex === -1) {
          continue;
        }

        const argumentsText = module.content.slice(
          openingIndex + 1,
          closingIndex
        );

        const argumentsList = this.splitArguments(
          argumentsText
        );

        if (argumentsList.length === 0) {
          continue;
        }

        const prefix = this.extractString(
          argumentsList[ 0 ]
        );

        if (prefix !== null) {
          return prefix;
        }

        // A dynamic global prefix cannot be resolved statically.
        return "";
      }
    }

    return "";
  }

  collectControllers(module) {
    const pattern =
      /@Controller\s*(?:\(([\s\S]*?)\))?\s*(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][\w$]*)/g;

    let match;

    while ((match = pattern.exec(module.content)) !== null) {
      this.ensureActive();

      const name = match[ 2 ];
      const prefix = this.extractString(
        match[ 1 ] || ""
      );

      module.controllers.add(name);

      module.controllerPrefixes ||= new Map();

      module.controllerPrefixes.set(name, {
        prefix: prefix ?? "",
        line: this.getLineNumber(
          module.content,
          match.index
        )
      });
    }
  }

  collectImports(module) {
    const content = module.content;

    const importPattern =
      /\bimport\s+([\s\S]*?)\s+from\s*(['"])([^'"]+)\2/g;

    let match;

    while ((match = importPattern.exec(content)) !== null) {
      const clause = match[ 1 ].trim();
      const specifier = match[ 3 ];

      if (!specifier.startsWith(".")) {
        continue;
      }

      const targetFile = this.resolveModuleFile(
        module.file,
        specifier,
        this._fileSet || new Set()
      );

      if (!targetFile) {
        continue;
      }

      this.parseImportClause(
        module,
        clause,
        targetFile
      );
    }

    const requirePattern =
      /\b(?:const|let|var)\s+(\{[^}]*\}|[a-zA-Z_$][\w$]*)\s*=\s*require\s*\(\s*(['"])([^'"]+)\2\s*\)/g;

    while ((match = requirePattern.exec(content)) !== null) {
      const declaration = match[ 1 ].trim();
      const specifier = match[ 3 ];

      if (!specifier.startsWith(".")) {
        continue;
      }

      const targetFile = this.resolveModuleFile(
        module.file,
        specifier,
        this._fileSet || new Set()
      );

      if (!targetFile) {
        continue;
      }

      this.parseRequireDeclaration(
        module,
        declaration,
        targetFile
      );
    }
  }

  parseImportClause(module, clause, targetFile) {
    const namespaceMatch = clause.match(
      /\*\s+as\s+([a-zA-Z_$][\w$]*)/
    );

    if (namespaceMatch) {
      module.imports.set(namespaceMatch[ 1 ], {
        targetFile,
        importedName: "*"
      });
    }

    const namedMatch = clause.match(
      /\{([\s\S]*?)\}/
    );

    if (namedMatch) {
      for (const entry of namedMatch[ 1 ].split(",")) {
        const parts = entry.trim().split(/\s+as\s+/);

        if (!parts[ 0 ]) {
          continue;
        }

        const importedName = parts[ 0 ].trim();
        const localName = (
          parts[ 1 ] || parts[ 0 ]
        ).trim();

        module.imports.set(localName, {
          targetFile,
          importedName
        });
      }
    }

    const defaultMatch = clause.match(
      /^([a-zA-Z_$][\w$]*)/
    );

    if (defaultMatch) {
      module.imports.set(defaultMatch[ 1 ], {
        targetFile,
        importedName: "default"
      });
    }
  }

  parseRequireDeclaration(
    module,
    declaration,
    targetFile
  ) {
    const destructured = declaration.match(
      /^\{\s*([\s\S]*?)\s*\}$/
    );

    if (destructured) {
      for (const entry of destructured[ 1 ].split(",")) {
        const parts = entry.trim().split(/\s*:\s*/);

        if (!parts[ 0 ]) {
          continue;
        }

        module.imports.set(
          (parts[ 1 ] || parts[ 0 ]).trim(),
          {
            targetFile,
            importedName: parts[ 0 ].trim()
          }
        );
      }

      return;
    }

    const identifier = declaration.match(
      /^[a-zA-Z_$][\w$]*/
    );

    if (identifier) {
      module.imports.set(identifier[ 0 ], {
        targetFile,
        importedName: "*"
      });
    }
  }

  collectExports(module) {
    const content = module.content;

    const defaultPattern =
      /\bexport\s+default\s+([a-zA-Z_$][\w$]*)/g;

    let match;

    while ((match = defaultPattern.exec(content)) !== null) {
      module.exports.set("default", match[ 1 ]);
    }

    const commonJSDefault =
      /\bmodule\.exports\s*=\s*([a-zA-Z_$][\w$]*)/g;

    while ((match = commonJSDefault.exec(content)) !== null) {
      module.exports.set("default", match[ 1 ]);
    }

    const commonJSNamed =
      /\b(?:module\.exports|exports)\.([a-zA-Z_$][\w$]*)\s*=\s*([a-zA-Z_$][\w$]*)/g;

    while ((match = commonJSNamed.exec(content)) !== null) {
      module.exports.set(match[ 1 ], match[ 2 ]);
    }

    const namedExport =
      /\bexport\s*\{\s*([^}]+)\s*\}/g;

    while ((match = namedExport.exec(content)) !== null) {
      for (const entry of match[ 1 ].split(",")) {
        const parts = entry.trim().split(/\s+as\s+/);

        if (!parts[ 0 ]) {
          continue;
        }

        module.exports.set(
          (parts[ 1 ] || parts[ 0 ]).trim(),
          parts[ 0 ].trim()
        );
      }
    }

    for (const name of module.controllers) {
      const exportedDeclaration = new RegExp(
        `\\bexport\\s+(?:default\\s+)?(?:abstract\\s+)?class\\s+${this.escapeRegExp(name)}\\b`
      );

      if (exportedDeclaration.test(content)) {
        module.exports.set(name, name);
      }
    }
  }

  collectModuleRegistrations(module) {
    const pattern = /@Module\s*\(/g;

    let match;

    while ((match = pattern.exec(module.mask)) !== null) {
      this.ensureActive();

      const openingIndex = module.mask.indexOf(
        "(",
        match.index
      );

      const closingIndex = this.findClosingDelimiter(
        module.mask,
        openingIndex,
        "(",
        ")"
      );

      if (closingIndex === -1) {
        continue;
      }

      const argumentsText = module.content.slice(
        openingIndex + 1,
        closingIndex
      );

      const controllers = this.extractArray(
        argumentsText,
        "controllers"
      );

      if (controllers === null) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const classMatch = module.mask
        .slice(closingIndex + 1)
        .match(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][\w$]*)/);

      const moduleName = classMatch
        ? classMatch[ 1 ]
        : null;

      module.moduleRegistrations.push({
        moduleName,
        controllers: controllers
          .map((entry) => entry.trim())
          .filter(Boolean),
        line: this.getLineNumber(
          module.content,
          match.index
        )
      });

      pattern.lastIndex = closingIndex + 1;
    }
  }

  extractArray(source, property) {
    const mask = this.createCodeMask(source);

    const propertyPattern = new RegExp(
      `\\b${this.escapeRegExp(property)}\\s*:`
    );

    const match = propertyPattern.exec(mask);

    if (!match) {
      return null;
    }

    const openingIndex = mask.indexOf(
      "[",
      match.index + match[ 0 ].length
    );

    if (openingIndex === -1) {
      return null;
    }

    const closingIndex = this.findClosingDelimiter(
      mask,
      openingIndex,
      "[",
      "]"
    );

    if (closingIndex === -1) {
      return null;
    }

    const value = source.slice(
      openingIndex + 1,
      closingIndex
    );

    return this.splitArguments(value);
  }

  resolveControllerReference(
    module,
    reference,
    modules
  ) {
    const parts = reference.trim().split(".");
    const localName = parts[ 0 ];

    const imported = module.imports.get(localName);

    if (imported) {
      const targetModule = modules.get(
        imported.targetFile
      );

      if (!targetModule) {
        return null;
      }

      let exportedName = imported.importedName;

      if (exportedName === "*") {
        exportedName = parts[ 1 ] || "default";
      }

      const actualName =
        targetModule.exports.get(exportedName) ||
        (
          targetModule.controllers.has(exportedName)
            ? exportedName
            : null
        );

      if (
        !actualName ||
        !targetModule.controllers.has(actualName)
      ) {
        return null;
      }

      return {
        file: targetModule.file,
        name: actualName
      };
    }

    if (module.controllers.has(localName)) {
      return {
        file: module.file,
        name: localName
      };
    }

    return null;
  }

  applyControllerPrefixes(
    routes,
    modules,
    globalPrefix = ""
  ) {
    const registrations = new Map();

    for (const module of modules.values()) {
      this.ensureActive();

      for (const registration of module.moduleRegistrations) {
        for (const reference of registration.controllers) {
          const resolved = this.resolveControllerReference(
            module,
            reference,
            modules
          );

          if (!resolved) {
            continue;
          }

          const key = this.createControllerKey(
            resolved.file,
            resolved.name
          );

          if (!registrations.has(key)) {
            registrations.set(key, []);
          }

          registrations.get(key).push({
            moduleFile: module.file,
            moduleName: registration.moduleName,
            line: registration.line
          });
        }
      }
    }

    const result = [];

    for (const route of routes) {
      this.ensureActive();

      if (!route.file || !route.controller) {
        result.push(route);
        continue;
      }

      const module = modules.get(route.file);

      if (!module) {
        result.push(route);
        continue;
      }

      const controllerInfo =
        module.controllerPrefixes?.get(route.controller);

      if (!controllerInfo) {
        result.push(route);
        continue;
      }

      const key = this.createControllerKey(
        route.file,
        route.controller
      );

      const moduleRegistrations =
        registrations.get(key) || [];

      const controllerPrefix =
        controllerInfo.prefix || "";

      const resolvedPath = this.joinPaths(
        globalPrefix,
        controllerPrefix,
        route.path
      );

      const resolvedRoute = {
        ...route,
        path: resolvedPath,
        metadata: {
          ...route.metadata,
          controllerResolved: true,
          controllerRegistered: moduleRegistrations.length > 0,
          controllerPrefix,
          globalPrefix,
          moduleRegistrations: moduleRegistrations.map(
            (registration) => ({
              file: registration.moduleFile,
              name: registration.moduleName,
              line: registration.line
            })
          )
        }
      };

      result.push(resolvedRoute);
    }

    return result;
  }

  createControllerKey(file, name) {
    return `${file}::${name}`;
  }

  extractString(value) {
    const trimmed = value.trim();

    if (
      trimmed.length < 2 ||
      ![ "'", '"', "`" ].includes(trimmed[ 0 ]) ||
      trimmed[ trimmed.length - 1 ] !== trimmed[ 0 ]
    ) {
      return null;
    }

    const quote = trimmed[ 0 ];
    const content = trimmed.slice(1, -1);

    if (
      quote === "`" &&
      /\$\{[\s\S]*?\}/.test(content)
    ) {
      return null;
    }

    return content;
  }

  splitArguments(value) {
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (let index = 0; index < value.length; index++) {
      const character = value[ index ];

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (character === "\\") {
          escaped = true;
          continue;
        }

        if (character === quote) {
          quote = null;
        }

        continue;
      }

      if (
        character === "'" ||
        character === '"' ||
        character === "`"
      ) {
        quote = character;
        continue;
      }

      if (
        character === "(" ||
        character === "[" ||
        character === "{"
      ) {
        depth++;
      } else if (
        character === ")" ||
        character === "]" ||
        character === "}"
      ) {
        depth--;
      } else if (
        character === "," &&
        depth === 0
      ) {
        parts.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }

    parts.push(value.slice(start).trim());

    return parts.filter(Boolean);
  }

  findClosingDelimiter(content, openingIndex, open, close) {
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

  resolveModuleFile(fromFile, specifier, fileSet) {
    const directory = this.getDirectory(fromFile);

    const base = this.normalizePath(
      `${directory}/${specifier}`
    );

    const candidates = [
      base,
      ...this.extensions.map(
        (extension) => `${base}${extension}`
      ),
      ...this.extensions.map(
        (extension) => `${base}/index${extension}`
      )
    ];

    const normalizedFiles = new Map();

    for (const file of fileSet) {
      normalizedFiles.set(
        this.normalizePath(file),
        file
      );
    }

    for (const candidate of candidates) {
      const originalFile = normalizedFiles.get(
        this.normalizePath(candidate)
      );

      if (originalFile) {
        return originalFile;
      }
    }

    return null;
  }

  getDirectory(file) {
    const normalized = this.normalizePath(file);
    const index = normalized.lastIndexOf("/");

    return index === -1
      ? ""
      : normalized.slice(0, index);
  }

  normalizePath(path) {
    const value = String(path).replace(/\\/g, "/");

    const uriMatch = value.match(
      /^([a-z][a-z0-9+.-]*:\/\/[^/]*)(\/.*)?$/i
    );

    const prefix = uriMatch
      ? uriMatch[ 1 ]
      : value.startsWith("/")
        ? "/"
        : "";

    const pathname = uriMatch
      ? uriMatch[ 2 ] || ""
      : value;

    const segments = pathname.split("/");
    const result = [];

    for (const segment of segments) {
      if (!segment || segment === ".") {
        continue;
      }

      if (segment === "..") {
        if (result.length > 0) {
          result.pop();
        }

        continue;
      }

      result.push(segment);
    }

    const normalized = result.join("/");

    if (uriMatch) {
      return normalized
        ? `${prefix}/${normalized}`
        : prefix;
    }

    return prefix
      ? `${prefix}${normalized}`
      : normalized || ".";
  }

  joinPaths(...paths) {
    const segments = paths
      .filter(Boolean)
      .map((path) => String(path).trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return "/";
    }

    const lastPath = segments[ segments.length - 1 ];
    const preserveTrailingSlash = lastPath.endsWith("/");

    const joined = segments
      .join("/")
      .replace(/\/+/g, "/");

    let normalized = `/${joined}`
      .replace(/\/+/g, "/");

    if (normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, "");

      if (preserveTrailingSlash) {
        normalized += "/";
      }
    }

    return normalized;
  }

  createCodeMask(content) {
    const mask = content.split("");
    let index = 0;

    const blank = (position) => {
      if (
        mask[ position ] !== "\n" &&
        mask[ position ] !== "\r"
      ) {
        mask[ position ] = " ";
      }
    };

    while (index < content.length) {
      const character = content[ index ];
      const next = content[ index + 1 ];

      if (character === "/" && next === "/") {
        blank(index++);
        blank(index++);

        while (
          index < content.length &&
          content[ index ] !== "\n"
        ) {
          blank(index++);
        }

        continue;
      }

      if (character === "/" && next === "*") {
        blank(index++);
        blank(index++);

        while (index < content.length) {
          if (
            content[ index ] === "*" &&
            content[ index + 1 ] === "/"
          ) {
            blank(index++);
            blank(index++);
            break;
          }

          blank(index++);
        }

        continue;
      }

      if (
        character === "'" ||
        character === '"' ||
        character === "`"
      ) {
        const quote = character;
        blank(index++);

        while (index < content.length) {
          const current = content[ index ];
          blank(index);

          if (current === "\\") {
            index++;

            if (index < content.length) {
              blank(index);
            }

            index++;
            continue;
          }

          if (current === quote) {
            index++;
            break;
          }

          index++;
        }

        continue;
      }

      index++;
    }

    return mask.join("");
  }

  getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
  }

  escapeRegExp(value) {
    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "NestJSControllerResolver has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.fileSystem = null;
    this._fileSet = null;
    this.destroyed = true;
  }
}
