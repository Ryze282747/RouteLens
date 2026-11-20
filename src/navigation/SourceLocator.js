export default class SourceLocator {
  constructor({ fileSystem = null } = {}) {
    this.fileSystem = fileSystem;
    this.destroyed = false;
    this.operationToken = 0;
  }

  locate(route) {
    this.ensureActive();
    this.validateRoute(route);

    return {
      file: route.file,
      line: this.normalizeLine(route.line),
      handler: route.handler || null,
      type: "route"
    };
  }

  async locateHandler(route) {
    this.ensureActive();
    this.validateRoute(route);

    if (
      typeof route.handler !== "string" ||
      !route.handler.trim()
    ) {
      return null;
    }

    if (
      !this.fileSystem ||
      typeof this.fileSystem.readFile !== "function"
    ) {
      return null;
    }

    const token = ++this.operationToken;
    const file = route.file;

    try {
      const content = await this.fileSystem.readFile(file);

      this.ensureOperationActive(token);

      if (typeof content !== "string") {
        return null;
      }

      const line = this.findHandlerLine(
        content,
        route.handler
      );

      this.ensureOperationActive(token);

      if (!line) {
        return null;
      }

      return {
        file,
        line,
        handler: route.handler,
        type: "handler"
      };
    } catch (error) {
      // Destruction must not be mistaken for a normal lookup failure.
      this.ensureActive();

      console.error(
        `[RouteLens] Failed to locate handler in ${file}:`,
        error
      );

      return null;
    }
  }

  findHandlerLine(content, handler) {
    if (
      typeof content !== "string" ||
      typeof handler !== "string" ||
      !handler.trim()
    ) {
      return null;
    }

    const handlerName = handler
      .trim()
      .split(/[.@]/)
      .pop();

    if (!handlerName) {
      return null;
    }

    const name = handlerName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const patterns = [
      // Python function declarations.
      new RegExp(
        String.raw`^[ \t]*(?:async\s+)?def\s+${name}\s*\(`,
        "m"
      ),

      // JavaScript, TypeScript and PHP function declarations.
      new RegExp(
        String.raw`^[ \t]*(?:(?:export|default|declare|async|public|protected|private|static|abstract|final)\s+)*function\s+${name}\s*\(`,
        "m"
      ),

      // Variable-based functions and arrow functions.
      new RegExp(
        String.raw`^[ \t]*(?:(?:export|default)\s+)?(?:const|let|var)\s+${name}\s*=`,
        "m"
      ),

      // Class methods and object methods.
      new RegExp(
        String.raw`^[ \t]*(?:(?:public|protected|private|static|async|override|abstract|final|readonly)\s+)*${name}\s*\(`,
        "m"
      )
    ];

    const code = this.createCodeMask(content);

    for (const pattern of patterns) {
      const match = pattern.exec(code);

      if (match) {
        return this.getLineNumber(content, match.index);
      }
    }

    return null;
  }

  createCodeMask(content) {
    const characters = content.split("");

    let state = "code";
    let quote = null;
    let escaped = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[ i ];
      const next = content[ i + 1 ];

      if (state === "line-comment") {
        if (char === "\n") {
          state = "code";
        } else if (char !== "\r") {
          characters[ i ] = " ";
        }

        continue;
      }

      if (state === "block-comment") {
        if (char === "*" && next === "/") {
          characters[ i ] = " ";
          characters[ i + 1 ] = " ";
          i++;
          state = "code";
        } else if (char !== "\n" && char !== "\r") {
          characters[ i ] = " ";
        }

        continue;
      }

      if (state === "string") {
        if (char !== "\n" && char !== "\r") {
          characters[ i ] = " ";
        }

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === "\\") {
          escaped = true;
          continue;
        }

        if (char === quote) {
          state = "code";
          quote = null;
        }

        continue;
      }

      if (state === "template") {
        if (char !== "\n" && char !== "\r") {
          characters[ i ] = " ";
        }

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === "\\") {
          escaped = true;
          continue;
        }

        if (char === "`") {
          state = "code";
        }

        continue;
      }

      if (char === "/" && next === "/") {
        characters[ i ] = " ";
        characters[ i + 1 ] = " ";
        i++;
        state = "line-comment";
        continue;
      }

      if (char === "/" && next === "*") {
        characters[ i ] = " ";
        characters[ i + 1 ] = " ";
        i++;
        state = "block-comment";
        continue;
      }

      // Python comments and PHP line comments.
      if (char === "#" || (char === "/" && next === "/")) {
        if (char === "#") {
          characters[ i ] = " ";
          state = "line-comment";
        }

        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        state = "string";
        characters[ i ] = " ";
        continue;
      }

      if (char === "`") {
        state = "template";
        characters[ i ] = " ";
      }
    }

    return characters.join("");
  }

  getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
  }

  normalizeLine(line) {
    return Number.isInteger(line) && line > 0
      ? line
      : null;
  }

  validateRoute(route) {
    if (
      !route ||
      typeof route !== "object" ||
      typeof route.file !== "string" ||
      !route.file.trim()
    ) {
      throw new TypeError(
        "A valid route with a source file is required."
      );
    }
  }

  ensureOperationActive(token) {
    this.ensureActive();

    if (token !== this.operationToken) {
      throw new Error(
        "Source location lookup was cancelled."
      );
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "SourceLocator has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.operationToken++;

    // The FileSystemAdapter is injected and remains caller-owned.
    this.fileSystem = null;
  }
}
