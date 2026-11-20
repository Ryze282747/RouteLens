
export default class LaravelGroupResolver {
  constructor({ fileSystem = null } = {}) {
    this.fileSystem = fileSystem;
    this.destroyed = false;
  }

  async resolve(routes, workspace) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError(
        "Routes must be provided as an array."
      );
    }

    if (!workspace?.root) {
      throw new Error("A valid workspace is required.");
    }

    if (
      !this.fileSystem ||
      typeof this.fileSystem.readFile !== "function"
    ) {
      return routes;
    }

    const apiPrefix = await this.resolveApiPrefix(
      workspace
    );

    this.ensureActive();

    const groupedRoutes = new Map();

    for (const route of routes) {
      this.ensureActive();

      const file =
        typeof route?.file === "string"
          ? route.file
          : "";

      if (!groupedRoutes.has(file)) {
        groupedRoutes.set(file, []);
      }

      groupedRoutes.get(file).push(route);
    }

    const resolvedRoutes = [];

    for (const [ file, fileRoutes ] of groupedRoutes) {
      this.ensureActive();

      if (!file) {
        resolvedRoutes.push(...fileRoutes);
        continue;
      }

      let content;

      try {
        content = await this.fileSystem.readFile(file);
      } catch (error) {
        this.ensureActive();

        console.error(
          `[RouteLens] Failed to resolve Laravel groups in ${file}:`,
          error
        );

        resolvedRoutes.push(...fileRoutes);
        continue;
      }

      this.ensureActive();

      if (typeof content !== "string") {
        resolvedRoutes.push(...fileRoutes);
        continue;
      }

      const groups = this.findGroups(content);
      const isApiFile = this.isApiRouteFile(
        file,
        workspace.root
      );

      for (const route of fileRoutes) {
        this.ensureActive();

        const routeLine = Number(route?.line);

        if (!Number.isFinite(routeLine)) {
          resolvedRoutes.push(route);
          continue;
        }

        const matchingGroups = groups
          .filter((group) => {
            return (
              routeLine >= group.startLine &&
              routeLine <= group.endLine
            );
          })
          .sort(
            (a, b) => a.startIndex - b.startIndex
          );

        const groupPrefixes = matchingGroups
          .map((group) => group.prefix)
          .filter(Boolean);

        const prefixes = [];

        if (isApiFile && apiPrefix) {
          prefixes.push(apiPrefix);
        }

        prefixes.push(...groupPrefixes);

        resolvedRoutes.push({
          ...route,
          path: this.joinPaths(
            ...prefixes,
            route.path
          ),
          metadata: {
            ...route.metadata,
            groupResolved: true,
            groupCount: matchingGroups.length,
            groupPrefixes,
            apiPrefix: isApiFile ? apiPrefix : null,
            apiPrefixResolved: Boolean(
              isApiFile && apiPrefix
            )
          }
        });
      }
    }

    this.ensureActive();

    return resolvedRoutes;
  }

  async resolveApiPrefix(workspace) {
    this.ensureActive();

    const root = String(workspace.root).replace(
      /\/+$/,
      ""
    );

    const bootstrapFile = `${root}/bootstrap/app.php`;

    let content;

    try {
      content = await this.fileSystem.readFile(
        bootstrapFile
      );
    } catch {
      this.ensureActive();
      return "";
    }

    this.ensureActive();

    if (typeof content !== "string") {
      return "";
    }

    const routingCalls = this.findNamedCallArguments(
      content,
      "withRouting"
    );

    for (const argumentsText of routingCalls) {
      const apiArgument = this.findNamedArgument(
        argumentsText,
        "api"
      );

      if (!apiArgument) {
        continue;
      }

      const apiPrefixArgument = this.findNamedArgument(
        argumentsText,
        "apiPrefix"
      );

      if (!apiPrefixArgument) {
        return "api";
      }

      const prefix = this.extractFirstString(
        apiPrefixArgument
      );

      return prefix;
    }

    return "";
  }

  isApiRouteFile(file, workspaceRoot) {
    const normalizedFile = String(file)
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/");

    const normalizedRoot = String(workspaceRoot)
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");

    const relativeFile = normalizedFile.startsWith(
      `${normalizedRoot}/`
    )
      ? normalizedFile.slice(normalizedRoot.length + 1)
      : normalizedFile;

    return /(?:^|\/)routes\/api\.php$/i.test(
      relativeFile
    );
  }

  findNamedCallArguments(content, methodName) {
    if (
      typeof content !== "string" ||
      typeof methodName !== "string"
    ) {
      return [];
    }

    const results = [];
    const pattern = new RegExp(
      `\\b${methodName}\\s*\\(`,
      "g"
    );

    let match;

    while ((match = pattern.exec(content)) !== null) {
      const openingIndex =
        match.index + match[ 0 ].lastIndexOf("(");

      const closingIndex = this.findClosingDelimiter(
        content,
        openingIndex,
        "(",
        ")"
      );

      if (closingIndex === -1) {
        continue;
      }

      results.push(
        content.slice(openingIndex + 1, closingIndex)
      );

      pattern.lastIndex = closingIndex + 1;
    }

    return results;
  }

  findNamedArgument(argumentsText, name) {
    if (
      typeof argumentsText !== "string" ||
      typeof name !== "string"
    ) {
      return "";
    }

    const pattern = new RegExp(
      `\\b${name}\\s*:\\s*`,
      "g"
    );

    const match = pattern.exec(argumentsText);

    if (!match) {
      return "";
    }

    const start = pattern.lastIndex;

    let quote = null;
    let escaped = false;
    let depth = 0;

    for (
      let index = start;
      index < argumentsText.length;
      index++
    ) {
      const character = argumentsText[ index ];

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
        character === '"'
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
        continue;
      }

      if (
        character === ")" ||
        character === "]" ||
        character === "}"
      ) {
        if (depth === 0) {
          return argumentsText.slice(start, index).trim();
        }

        depth--;
        continue;
      }

      if (character === "," && depth === 0) {
        return argumentsText.slice(start, index).trim();
      }
    }

    return argumentsText.slice(start).trim();
  }

  findGroups(content) {
    if (typeof content !== "string") {
      return [];
    }

    const groups = [];
    const pattern =
      /\bRoute\s*::\s*(group|prefix)\s*\(/g;

    const matches = content.matchAll(pattern);

    for (const match of matches) {
      const method = match[ 1 ];

      const openingIndex =
        match.index + match[ 0 ].lastIndexOf("(");

      const argumentsEnd = this.findClosingDelimiter(
        content,
        openingIndex,
        "(",
        ")"
      );

      if (argumentsEnd === -1) {
        continue;
      }

      const argumentsText = content.slice(
        openingIndex + 1,
        argumentsEnd
      );

      let bodySearchStart;
      let prefix;

      if (method === "prefix") {
        bodySearchStart = argumentsEnd + 1;

        const remainingContent = content.slice(
          bodySearchStart
        );

        const groupCall = remainingContent.match(
          /^\s*->\s*group\s*\(/
        );

        if (!groupCall) {
          continue;
        }

        prefix = this.extractFirstString(
          argumentsText
        );
      } else {
        bodySearchStart = openingIndex + 1;
        prefix = this.extractPrefix(argumentsText);
      }

      const bodyStart = this.findGroupBodyStart(
        content,
        bodySearchStart
      );

      if (bodyStart === -1) {
        continue;
      }

      const bodyEnd = this.findMatchingBrace(
        content,
        bodyStart
      );

      if (bodyEnd === -1) {
        continue;
      }

      groups.push({
        prefix,
        startIndex: match.index,
        endIndex: bodyEnd,
        startLine: this.getLineNumber(
          content,
          bodyStart
        ),
        endLine: this.getLineNumber(
          content,
          bodyEnd
        )
      });
    }

    return groups.sort(
      (a, b) => a.startIndex - b.startIndex
    );
  }

  findGroupBodyStart(content, startIndex) {
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (
      let index = startIndex;
      index < content.length;
      index++
    ) {
      const character = content[ index ];
      const next = content[ index + 1 ];

      if (lineComment) {
        if (character === "\n") {
          lineComment = false;
        }

        continue;
      }

      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index++;
        }

        continue;
      }

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

      if (character === "/" && next === "/") {
        lineComment = true;
        index++;
        continue;
      }

      if (character === "#") {
        lineComment = true;
        continue;
      }

      if (character === "/" && next === "*") {
        blockComment = true;
        index++;
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

      if (character === "{") {
        return index;
      }

      if (character === ";") {
        return -1;
      }
    }

    return -1;
  }

  findMatchingBrace(content, openingIndex) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (
      let index = openingIndex;
      index < content.length;
      index++
    ) {
      const character = content[ index ];
      const next = content[ index + 1 ];

      if (lineComment) {
        if (character === "\n") {
          lineComment = false;
        }

        continue;
      }

      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index++;
        }

        continue;
      }

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

      if (character === "/" && next === "/") {
        lineComment = true;
        index++;
        continue;
      }

      if (character === "#") {
        lineComment = true;
        continue;
      }

      if (character === "/" && next === "*") {
        blockComment = true;
        index++;
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

      if (character === "{") {
        depth++;
      } else if (character === "}") {
        depth--;

        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  findClosingDelimiter(
    content,
    openingIndex,
    open,
    close
  ) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (
      let index = openingIndex;
      index < content.length;
      index++
    ) {
      const character = content[ index ];
      const next = content[ index + 1 ];

      if (lineComment) {
        if (character === "\n") {
          lineComment = false;
        }

        continue;
      }

      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index++;
        }

        continue;
      }

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

      if (character === "/" && next === "/") {
        lineComment = true;
        index++;
        continue;
      }

      if (character === "#") {
        lineComment = true;
        continue;
      }

      if (character === "/" && next === "*") {
        blockComment = true;
        index++;
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

      if (character === open) {
        depth++;
      } else if (character === close) {
        depth--;

        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  extractPrefix(argumentsText) {
    if (typeof argumentsText !== "string") {
      return "";
    }

    const match = argumentsText.match(
      /['"]prefix['"]\s*=>\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1/
    );

    if (!match) {
      return "";
    }

    return match[ 2 ].replace(
      /\\(['"\\])/g,
      "$1"
    );
  }

  extractFirstString(argumentsText) {
    if (typeof argumentsText !== "string") {
      return "";
    }

    const match = argumentsText.match(
      /^\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1/
    );

    if (!match) {
      return "";
    }

    return match[ 2 ].replace(
      /\\(['"\\])/g,
      "$1"
    );
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

    return `/${parts.join("/")}`;
  }

  getLineNumber(content, index) {
    return content
      .slice(0, index)
      .split("\n")
      .length;
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "LaravelGroupResolver has been destroyed."
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
