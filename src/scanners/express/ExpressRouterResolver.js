
export default class ExpressRouterResolver {
  constructor({ fileSystem } = {}) {
    if (!fileSystem) {
      throw new Error(
        "ExpressRouterResolver requires a FileSystemAdapter."
      );
    }

    this.fileSystem = fileSystem;
    this.destroyed = false;

    this.extensions = [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
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
          definitions: new Set(),
          imports: new Map(),
          exports: new Map(),
          mounts: []
        });
      } catch (error) {
        console.error(
          `[RouteLens] Failed to read Express module: ${file}`,
          error
        );
      }
    }

    this.ensureActive();

    for (const module of modules.values()) {
      this.collectRouterDefinitions(module);
      this.collectImports(module);
      this.collectExports(module);
    }

    for (const module of modules.values()) {
      this.collectRouterMounts(module, modules, fileSet);
    }

    return this.applyResolvedPrefixes(routes, modules);
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
        blank(index);
        blank(index + 1);
        index += 2;

        while (
          index < content.length &&
          content[ index ] !== "\n"
        ) {
          blank(index);
          index++;
        }

        continue;
      }

      if (character === "/" && next === "*") {
        blank(index);
        blank(index + 1);
        index += 2;

        while (index < content.length) {
          if (
            content[ index ] === "*" &&
            content[ index + 1 ] === "/"
          ) {
            blank(index);
            blank(index + 1);
            index += 2;
            break;
          }

          blank(index);
          index++;
        }

        continue;
      }

      if (
        character === "'" ||
        character === '"' ||
        character === "`"
      ) {
        const quote = character;

        blank(index);
        index++;

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

  collectRouterDefinitions(module) {
    const pattern =
      /\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:express\s*\.\s*Router|Router)\s*\(/g;

    let match;

    while ((match = pattern.exec(module.mask)) !== null) {
      module.definitions.add(match[ 1 ]);
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

      this.parseImportClause(module, clause, targetFile);
    }

    // Match only one identifier or one destructured declaration.
    // This prevents the regex from consuming preceding statements.
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

      return;
    }

    const namedMatch = clause.match(/\{([\s\S]*?)\}/);

    if (namedMatch) {
      const entries = namedMatch[ 1 ].split(",");

      for (const entry of entries) {
        const parts = entry.trim().split(/\s+as\s+/);

        if (!parts[ 0 ]) {
          continue;
        }

        const importedName = parts[ 0 ].trim();
        const localName = (parts[ 1 ] || parts[ 0 ]).trim();

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

  parseRequireDeclaration(module, declaration, targetFile) {
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

        const localName = parts[ 0 ].trim();
        const exportedName = (parts[ 1 ] || parts[ 0 ]).trim();

        module.exports.set(exportedName, localName);
      }
    }

    for (const name of module.definitions) {
      const exportedDeclaration = new RegExp(
        `\\bexport\\s+(?:const|let|var)\\s+${this.escapeRegExp(name)}\\b`
      );

      if (exportedDeclaration.test(content)) {
        module.exports.set(name, name);
      }
    }
  }

  collectRouterMounts(module, modules, fileSet) {
    const pattern =
      /\b([a-zA-Z_$][\w$]*)\s*\.\s*use\s*\(/g;

    let match;

    while ((match = pattern.exec(module.mask)) !== null) {
      const openingIndex = pattern.lastIndex - 1;

      const closingIndex = this.findClosingParenthesis(
        module.mask,
        openingIndex
      );

      if (closingIndex === -1) {
        continue;
      }

      const argumentsText = module.content.slice(
        openingIndex + 1,
        closingIndex
      );

      const args = this.splitArguments(argumentsText);

      if (args.length === 0) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      let prefix = "";
      let childExpression = "";

      const firstArgument = args[ 0 ].trim();
      const firstString = this.extractString(firstArgument);

      if (firstString !== null) {
        prefix = firstString;
        childExpression = args[ args.length - 1 ].trim();
      } else {
        childExpression = args[ args.length - 1 ].trim();
      }

      const childName = this.extractRouterReference(
        childExpression
      );

      if (!childName) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const childNode = this.resolveRouterNode(
        module,
        childName,
        modules
      );

      if (!childNode) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const parentNode = module.definitions.has(match[ 1 ])
        ? this.createNodeKey(module.file, match[ 1 ])
        : this.createRootKey(module.file);

      module.mounts.push({
        parentNode,
        childNode,
        prefix,
        line: this.getLineNumber(
          module.content,
          match.index
        )
      });

      pattern.lastIndex = closingIndex + 1;
    }
  }

  resolveRouterNode(module, reference, modules) {
    const parts = reference.split(".");
    const localName = parts[ 0 ];
    const imported = module.imports.get(localName);

    if (imported) {
      const targetModule = modules.get(imported.targetFile);

      if (!targetModule) {
        return null;
      }

      let exportedName = imported.importedName;

      if (exportedName === "*") {
        exportedName = parts.length >= 2
          ? parts[ 1 ]
          : "default";
      }

      const actualName =
        targetModule.exports.get(exportedName) ||
        (
          targetModule.definitions.has(exportedName)
            ? exportedName
            : null
        );

      if (!actualName) {
        return null;
      }

      return this.createNodeKey(
        targetModule.file,
        actualName
      );
    }

    if (module.definitions.has(localName)) {
      return this.createNodeKey(
        module.file,
        localName
      );
    }

    return null;
  }

  applyResolvedPrefixes(routes, modules) {
    const mountsByChild = new Map();

    for (const module of modules.values()) {
      for (const mount of module.mounts) {
        if (!mountsByChild.has(mount.childNode)) {
          mountsByChild.set(mount.childNode, []);
        }

        mountsByChild.get(mount.childNode).push({
          ...mount,
          file: module.file
        });
      }
    }

    const result = [];

    for (const route of routes) {
      this.ensureActive();

      const file = route.file;
      const router = route.router;

      if (!file || !router) {
        result.push(route);
        continue;
      }

      const module = modules.get(file);

      if (!module || !module.definitions.has(router)) {
        result.push(route);
        continue;
      }

      const node = this.createNodeKey(file, router);
      const mounts = mountsByChild.get(node) || [];

      if (mounts.length === 0) {
        result.push({
          ...route,
          metadata: {
            ...route.metadata,
            routerResolved: true,
            routerMounted: false
          }
        });

        continue;
      }

      const prefixChains = this.resolveMountChains(
        node,
        mountsByChild
      );

      if (prefixChains.length === 0) {
        result.push(route);
        continue;
      }

      for (const chain of prefixChains) {
        const prefix = chain
          .map((item) => item.prefix)
          .filter(Boolean)
          .join("/");

        const resolvedPath = this.joinPaths(
          prefix,
          route.path
        );

        result.push({
          ...route,
          path: resolvedPath,
          metadata: {
            ...route.metadata,
            routerResolved: true,
            routerMounted: true,
            mountFile: chain[ chain.length - 1 ]?.file || null,
            mountChain: chain.map((item) => ({
              file: item.file,
              prefix: item.prefix
            }))
          }
        });
      }
    }

    return result;
  }

  resolveMountChains(node, mountsByChild, visited = new Set()) {
    if (visited.has(node)) {
      return [];
    }

    const nextVisited = new Set(visited);
    nextVisited.add(node);

    const mounts = mountsByChild.get(node) || [];
    const chains = [];

    for (const mount of mounts) {
      const current = {
        prefix: mount.prefix,
        file: mount.file
      };

      if (mount.parentNode.startsWith("@root:")) {
        chains.push([ current ]);
        continue;
      }

      const parentChains = this.resolveMountChains(
        mount.parentNode,
        mountsByChild,
        nextVisited
      );

      if (parentChains.length === 0) {
        chains.push([ current ]);
        continue;
      }

      for (const parentChain of parentChains) {
        chains.push([
          ...parentChain,
          current
        ]);
      }
    }

    return chains;
  }

  createNodeKey(file, name) {
    return `${file}::${name}`;
  }

  createRootKey(file) {
    return `@root:${file}`;
  }

  extractRouterReference(expression) {
    const trimmed = expression.trim();

    if (
      /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/.test(trimmed)
    ) {
      return trimmed;
    }

    return null;
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

  findClosingParenthesis(content, openingIndex) {
    let depth = 0;

    for (
      let index = openingIndex;
      index < content.length;
      index++
    ) {
      if (content[ index ] === "(") {
        depth++;
      } else if (content[ index ] === ")") {
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
        "ExpressRouterResolver has been destroyed."
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
