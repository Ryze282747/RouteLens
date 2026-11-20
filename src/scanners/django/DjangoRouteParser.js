
export default class DjangoRouteParser {
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

    this.routeFunctions = new Set([
      "path",
      "re_path"
    ]);

    this.methodDecorators = new Set([
      "require_GET",
      "require_POST",
      "require_safe"
    ]);
  }

  parse(content, context = {}) {
    this.ensureActive();

    if (typeof content !== "string") {
      throw new TypeError(
        "Python source content must be a string."
      );
    }

    const mask = this.createCodeMask(content);
    const routes = [];
    const pattern = /\b(path|re_path)\s*\(/g;

    let match;

    while ((match = pattern.exec(mask)) !== null) {
      this.ensureActive();

      const functionName = match[ 1 ];

      if (!this.routeFunctions.has(functionName)) {
        continue;
      }

      const openingIndex = mask.indexOf(
        "(",
        match.index
      );

      const closingIndex = this.findMatchingDelimiter(
        mask,
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

      const argumentsMask = mask.slice(
        openingIndex + 1,
        closingIndex
      );

      const args = this.splitArguments(
        argumentsText,
        argumentsMask
      );

      if (args.length < 2) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const routePath = this.extractString(args[ 0 ]);

      if (routePath === null) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const view = args[ 1 ].trim();

      if (
        !view ||
        /^include\s*\(/.test(view)
      ) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const name = this.extractKeywordString(
        args,
        "name"
      );

      const viewInfo = this.resolveView(
        content,
        mask,
        view,
        match.index
      );

      const methods = viewInfo.methods.length > 0
        ? viewInfo.methods
        : [ "ANY" ];

      routes.push({
        path: functionName === "re_path"
          ? this.normalizeRegexPath(routePath)
          : this.normalizePath(routePath),
        methods,
        handler: viewInfo.handler,
        file: context.file || null,
        line: this.getLineNumber(
          content,
          match.index
        ),
        source: {
          type: "url-pattern",
          expression: content.slice(
            match.index,
            closingIndex + 1
          ).trim(),
          routeFunction: functionName,
          view
        },
        metadata: {
          parser: "django",
          declaration: functionName,
          routeName: name,
          viewType: viewInfo.type,
          originalPath: routePath,
          methodsDetected: viewInfo.methods.length > 0,
          ...viewInfo.metadata
        }
      });

      pattern.lastIndex = closingIndex + 1;
    }

    return routes;
  }

  createCodeMask(content) {
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

      if (
        character === "'" ||
        character === '"'
      ) {
        const quote = character;

        const triple =
          content.slice(index, index + 3) === quote.repeat(3);

        const delimiter = triple
          ? quote.repeat(3)
          : quote;

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

  splitArguments(content, mask) {
    const argumentsList = [];

    let start = 0;
    let depth = 0;

    for (let index = 0; index < mask.length; index++) {
      const character = mask[ index ];

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
        argumentsList.push(
          content.slice(start, index).trim()
        );

        start = index + 1;
      }
    }

    const remaining = content.slice(start).trim();

    if (remaining) {
      argumentsList.push(remaining);
    }

    return argumentsList;
  }

  extractString(value) {
    if (typeof value !== "string") {
      return null;
    }

    const match = value.trim().match(
      /^(?:r|u|f|b|fr|rf|br|rb)?(['"]{1,3})([\s\S]*)\1$/i
    );

    if (!match) {
      return null;
    }

    const prefixMatch = value.trim().match(
      /^([a-zA-Z]{1,2})?['"]/
    );

    const prefix = (
      prefixMatch?.[ 1 ] || ""
    ).toLowerCase();

    if (
      prefix.includes("f") ||
      prefix.includes("b")
    ) {
      return null;
    }

    return match[ 2 ]
      .replace(/\\(['"\\])/g, "$1")
      .trim();
  }

  extractKeywordString(args, keyword) {
    for (const argument of args) {
      const match = argument.match(
        new RegExp(
          `^\\s*${keyword}\\s*=\\s*([\\s\\S]+)$`
        )
      );

      if (match) {
        return this.extractString(match[ 1 ]);
      }
    }

    return null;
  }

  resolveView(content, mask, view, routeIndex) {
    const normalizedView = view.trim();

    const classViewMatch = normalizedView.match(
      /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.as_view\s*\(/
    );

    if (classViewMatch) {
      const className = classViewMatch[ 1 ].split(".").pop();

      const classInfo = this.findClassMethods(
        content,
        mask,
        className
      );

      return {
        handler: `${className}.as_view`,
        type: "class-based",
        methods: classInfo.methods,
        metadata: {
          className,
          classMethods: classInfo.methods
        }
      };
    }

    const functionMatch = normalizedView.match(
      /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/
    );

    if (functionMatch) {
      const functionName = functionMatch[ 1 ].split(".").pop();

      const functionInfo = this.findFunction(
        content,
        mask,
        functionName,
        routeIndex
      );

      return {
        handler: functionMatch[ 1 ],
        type: "function-based",
        methods: functionInfo.methods,
        metadata: {
          functionName,
          isAsync: functionInfo.isAsync,
          decorators: functionInfo.decorators
        }
      };
    }

    return {
      handler: normalizedView || null,
      type: "unknown",
      methods: [],
      metadata: {}
    };
  }

  findFunction(content, mask, functionName, routeIndex) {
    const functionPattern = new RegExp(
      `^[ \\t]*(async\\s+)?def\\s+${this.escapeRegExp(functionName)}\\s*\\(`,
      "gm"
    );

    let match;

    while ((match = functionPattern.exec(mask)) !== null) {
      if (match.index >= routeIndex) {
        continue;
      }

      const lineStart = mask.lastIndexOf(
        "\n",
        match.index
      ) + 1;

      const indentation = mask
        .slice(lineStart, match.index)
        .length;

      if (indentation > 0) {
        continue;
      }

      const decorators = this.findDecorators(
        content,
        mask,
        lineStart
      );

      const methods = this.extractDecoratorMethods(
        decorators
      );

      return {
        methods,
        isAsync: Boolean(match[ 1 ]),
        decorators
      };
    }

    return {
      methods: [],
      isAsync: false,
      decorators: []
    };
  }

  findDecorators(content, mask, functionLineStart) {
    const decorators = [];

    let lineStart = mask.lastIndexOf(
      "\n",
      functionLineStart - 2
    ) + 1;

    while (lineStart < functionLineStart) {
      const lineEnd = mask.indexOf(
        "\n",
        lineStart
      );

      const end = lineEnd === -1
        ? functionLineStart
        : Math.min(lineEnd, functionLineStart);

      const line = mask.slice(lineStart, end).trim();

      if (!line) {
        lineStart = end + 1;
        continue;
      }

      if (!line.startsWith("@")) {
        break;
      }

      const originalLine = content.slice(
        lineStart,
        end
      ).trim();

      decorators.unshift(originalLine);

      lineStart = mask.lastIndexOf(
        "\n",
        lineStart - 2
      ) + 1;
    }

    return decorators;
  }

  extractDecoratorMethods(decorators) {
    const methods = new Set();

    for (const decorator of decorators) {
      const apiViewMatch = decorator.match(
        /@(?:[\w.]+\.)?api_view\s*\(\s*\[([\s\S]*?)\]\s*\)/
      );

      if (apiViewMatch) {
        const methodPattern = /(['"])([A-Za-z]+)\1/g;

        let match;

        while (
          (match = methodPattern.exec(apiViewMatch[ 1 ])) !== null
        ) {
          this.addMethod(methods, match[ 2 ]);
        }
      }

      const httpDecoratorMatch = decorator.match(
        /@(?:[\w.]+\.)?(require_GET|require_POST|require_safe|require_http_methods|require_http_method)\s*\(([\s\S]*?)\)/
      );

      if (!httpDecoratorMatch) {
        continue;
      }

      const decoratorName = httpDecoratorMatch[ 1 ];
      const argumentsText = httpDecoratorMatch[ 2 ];

      if (decoratorName === "require_GET") {
        methods.add("GET");
      } else if (decoratorName === "require_POST") {
        methods.add("POST");
      } else if (decoratorName === "require_safe") {
        methods.add("GET");
        methods.add("HEAD");
      } else {
        const methodPattern = /(['"])([A-Za-z]+)\1/g;

        let match;

        while (
          (match = methodPattern.exec(argumentsText)) !== null
        ) {
          this.addMethod(methods, match[ 2 ]);
        }
      }
    }

    return [ ...methods ];
  }

  findClassMethods(content, mask, className) {
    const classPattern = new RegExp(
      `^class\\s+${this.escapeRegExp(className)}\\b[^\\n]*:`,
      "gm"
    );

    const match = classPattern.exec(mask);

    if (!match) {
      return {
        methods: []
      };
    }

    const classStart = match.index;
    const classIndentation = 0;

    const methods = new Set();

    const methodPattern =
      /^[ \t]+(?:async\s+)?def\s+(get|post|put|patch|delete|options|head)\s*\(/gm;

    methodPattern.lastIndex = classStart + match[ 0 ].length;

    let methodMatch;

    while (
      (methodMatch = methodPattern.exec(mask)) !== null
    ) {
      const lineStart = mask.lastIndexOf(
        "\n",
        methodMatch.index
      ) + 1;

      const indentation = mask
        .slice(lineStart, methodMatch.index)
        .length;

      if (indentation <= classIndentation) {
        break;
      }

      this.addMethod(methods, methodMatch[ 1 ]);
    }

    return {
      methods: [ ...methods ]
    };
  }

  normalizePath(path) {
    const normalized = path
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/");

    return normalized || "/";
  }

  normalizeRegexPath(path) {
    const normalized = path
      .replace(/\\d\+/g, "<int>")
      .replace(/\[0-9\]\+/g, "<int>")
      .replace(/\\w\+/g, "<str>")
      .replace(/\(\?P<([a-zA-Z_]\w*)>[^)]+\)/g, "<$1>")
      .replace(/\/+/g, "/");

    return normalized || "/";
  }

  addMethod(methods, method) {
    const normalized = method.toUpperCase();

    if (this.httpMethods.has(normalized)) {
      methods.add(normalized);
    }
  }

  findMatchingDelimiter(content, openingIndex, open, close) {
    if (
      typeof content !== "string" ||
      openingIndex < 0
    ) {
      return -1;
    }

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

  escapeRegExp(value) {
    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
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
        "DjangoRouteParser has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.httpMethods.clear();
    this.routeFunctions.clear();
    this.methodDecorators.clear();

    this.destroyed = true;
  }
}
