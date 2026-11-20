export default class LaravelRouteParser {
  constructor() {
    this.destroyed = false;

    this.httpMethods = new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD"
    ]);
  }

  async parse(content, context = {}) {
    this.ensureActive();

    if (typeof content !== "string") {
      throw new TypeError("PHP source content must be a string.");
    }

    const routes = [];
    const declarations = this.findDeclarations(content);

    for (const declaration of declarations) {
      this.ensureActive();

      const route = this.parseDeclaration(
        declaration,
        context
      );

      if (route) {
        routes.push(route);
      }
    }

    return routes;
  }

  /**
   * Creates a source mask that hides PHP comments and strings.
   *
   * Newlines and character positions are preserved so matches
   * in the masked source can be mapped to the original source.
   */
  createCodeMask(content) {
    const characters = content.split("");

    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < content.length; index++) {
      const character = content[ index ];
      const next = content[ index + 1 ];

      if (lineComment) {
        if (character === "\n") {
          lineComment = false;
        } else if (character !== "\r") {
          characters[ index ] = " ";
        }

        continue;
      }

      if (blockComment) {
        if (character === "*" && next === "/") {
          characters[ index ] = " ";
          characters[ index + 1 ] = " ";
          index++;
          blockComment = false;
          continue;
        }

        if (character !== "\n" && character !== "\r") {
          characters[ index ] = " ";
        }

        continue;
      }

      if (quote) {
        if (character !== "\n" && character !== "\r") {
          characters[ index ] = " ";
        }

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
        characters[ index ] = " ";
        characters[ index + 1 ] = " ";
        index++;
        lineComment = true;
        continue;
      }

      if (character === "/" && next === "*") {
        characters[ index ] = " ";
        characters[ index + 1 ] = " ";
        index++;
        blockComment = true;
        continue;
      }

      if (character === "#") {
        characters[ index ] = " ";
        lineComment = true;
        continue;
      }

      if (
        character === "'" ||
        character === '"' ||
        character === "`"
      ) {
        characters[ index ] = " ";
        quote = character;
      }
    }

    return characters.join("");
  }

  findDeclarations(content) {
    const declarations = [];
    const codeMask = this.createCodeMask(content);

    const pattern =
      /\bRoute\s*::\s*(get|post|put|patch|delete|options|head|any|match|resource|apiResource)\s*\(/gi;

    let match;

    while ((match = pattern.exec(codeMask)) !== null) {
      const openingIndex = pattern.lastIndex - 1;

      const closingIndex = this.findClosingParenthesis(
        content,
        openingIndex
      );

      if (closingIndex === -1) {
        continue;
      }

      declarations.push({
        method: match[ 1 ],
        arguments: content.slice(
          openingIndex + 1,
          closingIndex
        ),
        expression: content.slice(
          match.index,
          closingIndex + 1
        ),
        index: match.index,
        line: this.getLineNumber(content, match.index)
      });

      pattern.lastIndex = closingIndex + 1;
    }

    return declarations;
  }

  parseDeclaration(declaration, context) {
    const method = declaration.method.toLowerCase();
    const args = this.splitArguments(declaration.arguments);

    if (method === "resource" || method === "apiresource") {
      return this.parseResource(
        declaration,
        args,
        context
      );
    }

    if (method === "match") {
      return this.parseMatch(
        declaration,
        args,
        context
      );
    }

    const path = this.extractString(args[ 0 ]);

    if (path === null) {
      return null;
    }

    const methods = method === "any"
      ? [ ...this.httpMethods ]
      : [ method.toUpperCase() ];

    return this.createRoute({
      path,
      methods,
      handler: this.extractHandler(args[ 1 ]),
      declaration,
      context
    });
  }

  parseMatch(declaration, args, context) {
    if (args.length < 2) {
      return null;
    }

    const methods = this.extractArrayStrings(args[ 0 ]);
    const path = this.extractString(args[ 1 ]);

    if (path === null || methods.length === 0) {
      return null;
    }

    const validMethods = methods
      .map((method) => method.toUpperCase())
      .filter((method) => this.httpMethods.has(method));

    if (validMethods.length === 0) {
      return null;
    }

    return this.createRoute({
      path,
      methods: [ ...new Set(validMethods) ],
      handler: this.extractHandler(args[ 2 ]),
      declaration,
      context
    });
  }

  parseResource(declaration, args, context) {
    const path = this.extractString(args[ 0 ]);

    if (path === null) {
      return null;
    }

    const apiOnly =
      declaration.method.toLowerCase() === "apiresource";

    const methods = [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE"
    ];

    return this.createRoute({
      path,
      methods,
      handler: this.extractHandler(args[ 1 ]),
      declaration,
      context,
      metadata: {
        resource: true,
        apiResource: apiOnly,
        resourceType: apiOnly ? "apiResource" : "resource"
      }
    });
  }

  createRoute({
    path,
    methods,
    handler,
    declaration,
    context,
    metadata = {}
  }) {
    return {
      path,
      methods,
      handler: handler || null,
      file: context.file || null,
      line: declaration.line,
      source: {
        type: "facade-call",
        expression: declaration.expression
      },
      metadata: {
        parser: "laravel",
        declaration: `Route::${declaration.method}`,
        ...metadata
      }
    };
  }

  extractHandler(value) {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();

    // Controller array syntax:
    // [UserController::class, "show"]
    const arrayMatch = trimmed.match(
      /^\[\s*([a-zA-Z_\\][\w\\]*)\s*::\s*class\s*,\s*(['"])(.*?)\2\s*\]$/
    );

    if (arrayMatch) {
      return `${arrayMatch[ 1 ]}@${arrayMatch[ 3 ]}`;
    }

    // String controller syntax:
    // "UserController@show"
    const stringMatch = trimmed.match(
      /^(['"])(.*?)\1$/
    );

    if (stringMatch) {
      return stringMatch[ 2 ];
    }

    // Invokable controller:
    // UserController::class
    const classMatch = trimmed.match(
      /^([a-zA-Z_\\][\w\\]*)\s*::\s*class$/
    );

    if (classMatch) {
      return classMatch[ 1 ];
    }

    return null;
  }

  extractString(value) {
    if (!value) {
      return null;
    }

    const match = value.trim().match(
      /^(['"])(.*?)\1$/
    );

    return match ? match[ 2 ] : null;
  }

  extractArrayStrings(value) {
    if (!value) {
      return [];
    }

    const match = value.match(
      /^\s*\[([\s\S]*)\]\s*$/
    );

    if (!match) {
      return [];
    }

    const items = this.splitArguments(match[ 1 ]);
    const methods = [];

    for (const item of items) {
      const method = this.extractString(item);

      if (method !== null) {
        methods.push(method);
      }
    }

    return methods;
  }

  /**
   * Removes PHP comments while preserving quoted strings.
   * This allows argument values to be parsed without
   * accidentally removing comment-like text inside strings.
   */
  stripComments(content) {
    const characters = content.split("");

    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < content.length; index++) {
      const character = content[ index ];
      const next = content[ index + 1 ];

      if (lineComment) {
        if (character === "\n") {
          lineComment = false;
        } else if (character !== "\r") {
          characters[ index ] = " ";
        }

        continue;
      }

      if (blockComment) {
        if (character === "*" && next === "/") {
          characters[ index ] = " ";
          characters[ index + 1 ] = " ";
          index++;
          blockComment = false;
          continue;
        }

        if (character !== "\n" && character !== "\r") {
          characters[ index ] = " ";
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
        characters[ index ] = " ";
        characters[ index + 1 ] = " ";
        index++;
        lineComment = true;
        continue;
      }

      if (character === "/" && next === "*") {
        characters[ index ] = " ";
        characters[ index + 1 ] = " ";
        index++;
        blockComment = true;
        continue;
      }

      if (character === "#") {
        characters[ index ] = " ";
        lineComment = true;
        continue;
      }

      if (
        character === "'" ||
        character === '"' ||
        character === "`"
      ) {
        quote = character;
      }
    }

    return characters.join("");
  }

  splitArguments(argumentsText) {
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = null;
    let escaped = false;

    const source = argumentsText;

    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < source.length; index++) {
      const character = source[ index ];
      const next = source[ index + 1 ];

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

      if (character === "/" && next === "*") {
        blockComment = true;
        index++;
        continue;
      }

      if (character === "#") {
        lineComment = true;
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
      } else if (character === "," && depth === 0) {
        parts.push(source.slice(start, index));
        start = index + 1;
      }
    }

    parts.push(source.slice(start));

    return parts
      .map((part) => this.stripComments(part).trim())
      .filter(Boolean);
  }

  findClosingParenthesis(content, openingIndex) {
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

      if (character === "/" && next === "*") {
        blockComment = true;
        index++;
        continue;
      }

      if (character === "#") {
        lineComment = true;
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

      if (character === "(") {
        depth++;
      } else if (character === ")") {
        depth--;

        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("LaravelRouteParser has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.httpMethods.clear();
    this.destroyed = true;
  }
}
