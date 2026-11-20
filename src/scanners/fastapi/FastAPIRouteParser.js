export default class FastAPIRouteParser {
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

    this.routeDecorators = new Set([
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "options",
      "head",
      "api_route"
    ]);
  }

  parse(content, context = {}) {
    this.ensureActive();

    if (typeof content !== "string") {
      return [];
    }

    const source = this.maskCommentsAndStrings(content);
    const routes = [];

    const decoratorPattern =
      /@([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/g;

    let match;

    while ((match = decoratorPattern.exec(source)) !== null) {
      this.ensureActive();

      const expression = match[ 1 ];
      const method = expression.split(".").pop();

      if (!this.routeDecorators.has(method)) {
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

      const path = this.extractFirstString(argumentsText);

      if (!path) {
        continue;
      }

      const handler = this.findHandler(
        source,
        closingIndex + 1
      );

      if (!handler) {
        continue;
      }

      const methods = this.extractMethods(
        method,
        argumentsText
      );

      if (methods.length === 0) {
        continue;
      }

      const route = {
        path,
        methods,
        handler: handler.name,
        file: context.file || null,
        line: this.getLineNumber(content, match.index),
        source: {
          type: "decorator",
          expression: content.slice(
            match.index,
            closingIndex + 1
          ).trim()
        },
        metadata: {
          parser: "fastapi",
          declaration: `@${expression}`,
          router: expression.split(".")[ 0 ],
          handlerLine: handler.line,
          isAsync: handler.isAsync,
          ...this.extractMetadata(argumentsText, method)
        }
      };

      routes.push(route);

      // Skip the decorator arguments we already processed.
      decoratorPattern.lastIndex = closingIndex + 1;
    }

    return routes;
  }

  extractMethods(method, argumentsText) {
    const normalizedMethod = method.toUpperCase();

    if (method !== "api_route") {
      return this.httpMethods.has(normalizedMethod)
        ? [ normalizedMethod ]
        : [];
    }

    const methodsMatch = argumentsText.match(
      /\bmethods\s*=\s*(\[[\s\S]*?\]|\([\s\S]*?\))/
    );

    if (!methodsMatch) {
      return [ "GET" ];
    }

    const methods = [];
    const pattern = /(['"])([A-Za-z]+)\1/g;

    let match;

    while ((match = pattern.exec(methodsMatch[ 1 ])) !== null) {
      const value = match[ 2 ].toUpperCase();

      if (
        this.httpMethods.has(value) &&
        !methods.includes(value)
      ) {
        methods.push(value);
      }
    }

    return methods;
  }

  extractFirstString(argumentsText) {
    if (typeof argumentsText !== "string") {
      return "";
    }

    const match = argumentsText.match(
      /^\s*(?:r|u|f|b|fr|rf|br|rb)?(['"]{1,3})([\s\S]*?)\1/
    );

    if (!match) {
      return "";
    }

    const path = match[ 2 ];

    // Dynamic f-string paths cannot be reliably resolved statically.
    if (/^\s*[fF]/.test(match[ 0 ])) {
      return "";
    }

    return path
      .replace(/\\(['"\\])/g, "$1")
      .trim();
  }

  findHandler(source, startIndex) {
    const remaining = source.slice(startIndex);

    const pattern =
      /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;

    const match = remaining.match(pattern);

    if (!match) {
      return null;
    }

    const prefix = match[ 0 ];
    const isAsync = /^\s*async\s+def/.test(prefix);

    return {
      name: match[ 1 ],
      isAsync,
      line: this.getLineNumber(
        source,
        startIndex + match.index
      )
    };
  }

  extractMetadata(argumentsText, method) {
    const metadata = {};

    const keywordPattern =
      /\b([A-Za-z_]\w*)\s*=\s*([^,\n]+(?:\([^)]*\))?)/g;

    let match;

    while ((match = keywordPattern.exec(argumentsText)) !== null) {
      const key = match[ 1 ];
      const value = match[ 2 ].trim();

      if (key === "methods") {
        continue;
      }

      if (
        key === "name" ||
        key === "status_code" ||
        key === "response_model" ||
        key === "deprecated"
      ) {
        metadata[ key ] = value;
      }

      if (key === "tags") {
        metadata.tags = this.extractStringArray(value);
      }
    }

    return metadata;
  }

  extractStringArray(value) {
    if (typeof value !== "string") {
      return [];
    }

    const values = [];
    const pattern = /(['"])(.*?)\1/g;

    let match;

    while ((match = pattern.exec(value)) !== null) {
      values.push(match[ 2 ]);
    }

    return values;
  }

  findMatchingDelimiter(
    content,
    openingIndex,
    open,
    close
  ) {
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
      const character = content[ index ];

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

  maskCommentsAndStrings(content) {
    const characters = content.split("");

    let index = 0;

    while (index < content.length) {
      const character = content[ index ];

      // Python comments.
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

      // Python strings, including triple-quoted strings.
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

  getLineNumber(content, index) {
    return content
      .slice(0, index)
      .split("\n")
      .length;
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "FastAPIRouteParser has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.httpMethods.clear();
    this.routeDecorators.clear();
    this.destroyed = true;
  }
}
