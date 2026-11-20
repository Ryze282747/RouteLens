export default class ExpressRouteParser {
  constructor() {
    this.destroyed = false;

    this.httpMethods = new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD",
      "ALL"
    ]);
  }

  async parse(content, context = {}) {
    this.ensureActive();

    if (typeof content !== "string") {
      throw new TypeError("Source content must be a string.");
    }

    const mask = this.createCodeMask(content);

    const chainResult = this.parseRouteChains(
      content,
      mask,
      context
    );

    const directRoutes = this.parseDirectRoutes(
      content,
      mask,
      context,
      chainResult.ranges
    );

    return [
      ...directRoutes,
      ...chainResult.routes
    ];
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

      // Line comments.
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

      // Block comments.
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

      // Strings and template literals.
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

  parseDirectRoutes(content, mask, context, excludedRanges = []) {
    const routes = [];

    const pattern =
      /\b([a-zA-Z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(/gi;

    let match;

    while ((match = pattern.exec(mask)) !== null) {
      this.ensureActive();

      const matchIndex = match.index;

      const isInsideChain = excludedRanges.some(
        (range) =>
          matchIndex >= range.start &&
          matchIndex <= range.end
      );

      if (isInsideChain) {
        continue;
      }

      const openingIndex = pattern.lastIndex - 1;

      const closingIndex = this.findClosingDelimiter(
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

      const path = this.extractPath(argumentsText);

      if (path === null) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const method = match[ 2 ].toUpperCase();

      routes.push({
        path,
        methods: this.expandMethod(method),
        handler: this.extractHandler(argumentsText),
        router: match[ 1 ],
        file: context.file || null,
        line: this.getLineNumber(content, matchIndex),
        source: {
          type: "method-call",
          expression: content.slice(
            matchIndex,
            closingIndex + 1
          )
        },
        metadata: {
          parser: "express",
          declaration: `${match[ 1 ]}.${match[ 2 ]}`
        }
      });

      pattern.lastIndex = closingIndex + 1;
    }

    return routes;
  }

  parseRouteChains(content, mask, context) {
    const routes = [];
    const ranges = [];

    const pattern =
      /\b([a-zA-Z_$][\w$]*)\s*\.\s*route\s*\(/g;

    let match;

    while ((match = pattern.exec(mask)) !== null) {
      this.ensureActive();

      const openingIndex = pattern.lastIndex - 1;

      const closingIndex = this.findClosingDelimiter(
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

      const path = this.extractPath(argumentsText);

      if (path === null) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const chainResult = this.findChainMethods(
        mask,
        closingIndex + 1
      );

      if (chainResult.methods.length === 0) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const chainEnd = chainResult.end;

      ranges.push({
        start: match.index,
        end: chainEnd
      });

      const expression = content.slice(
        match.index,
        chainEnd
      ).trim();

      for (const method of chainResult.methods) {
        routes.push({
          path,
          methods: this.expandMethod(method),
          handler: null,
          router: match[ 1 ],
          file: context.file || null,
          line: this.getLineNumber(
            content,
            match.index
          ),
          source: {
            type: "route-chain",
            expression
          },
          metadata: {
            parser: "express",
            declaration: `route().${method.toLowerCase()}`
          }
        });
      }

      pattern.lastIndex = chainEnd;
    }

    return {
      routes,
      ranges
    };
  }

  findChainMethods(mask, startIndex) {
    const methods = [];
    let index = startIndex;
    let end = startIndex;

    const methodPattern =
      /^(get|post|put|patch|delete|options|head|all)\s*\(/i;

    while (index < mask.length) {
      while (
        index < mask.length &&
        /\s/.test(mask[ index ])
      ) {
        index++;
      }

      if (mask[ index ] === ";") {
        end = index + 1;
        break;
      }

      if (mask[ index ] !== ".") {
        break;
      }

      index++;

      while (
        index < mask.length &&
        /\s/.test(mask[ index ])
      ) {
        index++;
      }

      const remaining = mask.slice(index);
      const match = remaining.match(methodPattern);

      if (!match) {
        break;
      }

      const method = match[ 1 ].toUpperCase();

      const openingIndex =
        index + match[ 0 ].lastIndexOf("(");

      const closingIndex = this.findClosingDelimiter(
        mask,
        openingIndex,
        "(",
        ")"
      );

      if (closingIndex === -1) {
        break;
      }

      methods.push(method);

      end = closingIndex + 1;
      index = end;
    }

    return {
      methods,
      end
    };
  }

  expandMethod(method) {
    if (method !== "ALL") {
      return [ method ];
    }

    return [ ...this.httpMethods ].filter(
      (item) => item !== "ALL"
    );
  }

  extractPath(argumentsText) {
    const trimmed = argumentsText.trimStart();

    if (!trimmed) {
      return null;
    }

    const quote = trimmed[ 0 ];

    if (
      quote !== "'" &&
      quote !== '"' &&
      quote !== "`"
    ) {
      return null;
    }

    let escaped = false;
    let closingIndex = -1;

    for (let index = 1; index < trimmed.length; index++) {
      const character = trimmed[ index ];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === quote) {
        closingIndex = index;
        break;
      }
    }

    if (closingIndex === -1) {
      return null;
    }

    const path = trimmed.slice(1, closingIndex);

    // Dynamic template literals cannot be resolved statically.
    if (
      quote === "`" &&
      /\$\{[\s\S]*?\}/.test(path)
    ) {
      return null;
    }

    return path;
  }

  extractHandler(argumentsText) {
    const parts = this.splitArguments(argumentsText);

    if (parts.length < 2) {
      return null;
    }

    const handler = parts[ parts.length - 1 ].trim();

    if (
      /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/.test(handler)
    ) {
      return handler;
    }

    return null;
  }

  splitArguments(argumentsText) {
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (
      let index = 0;
      index < argumentsText.length;
      index++
    ) {
      const character = argumentsText[ index ];
      const next = argumentsText[ index + 1 ];

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
        parts.push(
          argumentsText.slice(start, index)
        );

        start = index + 1;
      }
    }

    parts.push(argumentsText.slice(start));

    return parts.filter(
      (part) => part.trim()
    );
  }

  findClosingDelimiter(content, openingIndex, open, close) {
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

  getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "ExpressRouteParser has been destroyed."
      );
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
