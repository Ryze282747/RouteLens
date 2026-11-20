export default class FlaskRouteParser {
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
      throw new TypeError("Python source content must be a string.");
    }

    const routes = [];
    const decorators = this.findRouteDecorators(content);

    for (const decorator of decorators) {
      this.ensureActive();

      const handler = this.findHandler(
        content,
        decorator.end
      );

      if (!handler) {
        continue;
      }

      const path = this.extractPath(decorator.arguments);

      if (path === null) {
        continue;
      }

      const methods = this.extractMethods(
        decorator.method,
        decorator.arguments
      );

      routes.push({
        path,
        methods,
        handler: handler.name,
        blueprint: decorator.object.split(".").pop(),
        file: context.file || null,
        line: decorator.line,
        source: {
          type: "decorator",
          expression: decorator.expression,
          routeObject: decorator.object
        },
        metadata: {
          parser: "flask",
          routeMethod: decorator.method,
          isAsync: handler.isAsync
        }
      });
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

        for (let offset = 0; offset < delimiter.length; offset++) {
          characters[ index + offset ] = " ";
        }

        index += delimiter.length;

        while (index < content.length) {
          if (content[ index ] === "\\") {
            characters[ index ] = " ";

            if (index + 1 < content.length) {
              if (content[ index + 1 ] !== "\n") {
                characters[ index + 1 ] = " ";
              }

              index += 2;
            } else {
              index++;
            }

            continue;
          }

          if (
            content.slice(
              index,
              index + delimiter.length
            ) === delimiter
          ) {
            for (
              let offset = 0;
              offset < delimiter.length;
              offset++
            ) {
              characters[ index + offset ] = " ";
            }

            index += delimiter.length;
            break;
          }

          if (content[ index ] !== "\n") {
            characters[ index ] = " ";
          }

          index++;
        }

        continue;
      }

      index++;
    }

    return characters.join("");
  }

  findRouteDecorators(content) {
    const decorators = [];
    const mask = this.createCodeMask(content);

    const pattern =
      /^[ \t]*@([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*?)\.(route|get|post|put|patch|delete|options|head)\s*\(/gm;

    let match;

    while ((match = pattern.exec(mask)) !== null) {
      this.ensureActive();

      const object = match[ 1 ];
      const method = match[ 2 ].toLowerCase();

      const openingIndex = mask.indexOf(
        "(",
        match.index
      );

      if (openingIndex === -1) {
        continue;
      }

      const closingIndex = this.findClosingParenthesis(
        content,
        openingIndex
      );

      if (closingIndex === -1) {
        continue;
      }

      const argumentsText = content.slice(
        openingIndex + 1,
        closingIndex
      );

      decorators.push({
        object,
        expression: content.slice(
          match.index,
          closingIndex + 1
        ).trim(),
        method,
        arguments: argumentsText,
        line: this.getLineNumber(
          content,
          match.index
        ),
        end: closingIndex + 1
      });

      pattern.lastIndex = closingIndex + 1;
    }

    return decorators;
  }

  findClosingParenthesis(content, openingIndex) {
    const mask = this.createCodeMask(content);

    let depth = 0;

    for (
      let index = openingIndex;
      index < mask.length;
      index++
    ) {
      const character = mask[ index ];

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

  readStringLiteral(content, startIndex = 0) {
    let index = startIndex;

    while (
      index < content.length &&
      /\s/.test(content[ index ])
    ) {
      index++;
    }

    const prefixMatch = content
      .slice(index)
      .match(/^(?:([a-zA-Z]{1,2}))?(?=['"])/);

    if (!prefixMatch) {
      return null;
    }

    const prefix = (prefixMatch[ 1 ] || "").toLowerCase();

    index += prefixMatch[ 0 ].length;

    const quote = content[ index ];

    if (
      quote !== "'" &&
      quote !== '"'
    ) {
      return null;
    }

    const triple =
      content.slice(index, index + 3) === quote.repeat(3);

    const delimiter = triple
      ? quote.repeat(3)
      : quote;

    index += delimiter.length;

    const valueStart = index;
    let value = "";

    while (index < content.length) {
      const character = content[ index ];

      if (character === "\\") {
        value += character;

        if (index + 1 < content.length) {
          value += content[ index + 1 ];
          index += 2;
        } else {
          index++;
        }

        continue;
      }

      if (
        content.slice(
          index,
          index + delimiter.length
        ) === delimiter
      ) {
        return {
          prefix,
          quote,
          triple,
          value,
          start: startIndex,
          valueStart,
          valueEnd: index,
          end: index + delimiter.length
        };
      }

      value += character;
      index++;
    }

    return null;
  }

  extractPath(argumentsText) {
    const literal = this.readStringLiteral(
      argumentsText,
      0
    );

    if (!literal) {
      return null;
    }

    if (
      literal.prefix.includes("f") ||
      literal.prefix.includes("b")
    ) {
      return null;
    }

    return literal.value;
  }

  extractMethods(decoratorMethod, argumentsText) {
    if (decoratorMethod !== "route") {
      const method = decoratorMethod.toUpperCase();

      return this.httpMethods.has(method)
        ? [ method ]
        : [ "GET" ];
    }

    const mask = this.createCodeMask(argumentsText);

    const methodsMatch = /\bmethods\s*=\s*[\[(]/.exec(mask);

    if (!methodsMatch) {
      return [ "GET" ];
    }

    const openingIndex =
      methodsMatch.index + methodsMatch[ 0 ].length - 1;

    const opening = mask[ openingIndex ];
    const closing = opening === "[" ? "]" : ")";

    let depth = 0;
    let closingIndex = -1;

    for (
      let index = openingIndex;
      index < mask.length;
      index++
    ) {
      if (mask[ index ] === opening) {
        depth++;
      } else if (mask[ index ] === closing) {
        depth--;

        if (depth === 0) {
          closingIndex = index;
          break;
        }
      }
    }

    if (closingIndex === -1) {
      return [ "GET" ];
    }

    const methodsText = argumentsText.slice(
      openingIndex + 1,
      closingIndex
    );

    const methods = [];
    let index = 0;

    while (index < methodsText.length) {
      const character = methodsText[ index ];

      if (
        character === "'" ||
        character === '"'
      ) {
        const literal = this.readStringLiteral(
          methodsText,
          index
        );

        if (!literal) {
          index++;
          continue;
        }

        const method = literal.value.trim().toUpperCase();

        if (
          this.httpMethods.has(method) &&
          !methods.includes(method)
        ) {
          methods.push(method);
        }

        index = literal.end;
        continue;
      }

      if (character === "#") {
        while (
          index < methodsText.length &&
          methodsText[ index ] !== "\n"
        ) {
          index++;
        }

        continue;
      }

      index++;
    }

    return methods.length > 0
      ? methods
      : [ "GET" ];
  }

  findHandler(content, decoratorEnd) {
    const remaining = content.slice(decoratorEnd);
    const mask = this.createCodeMask(remaining);

    const functionPattern =
      /^[ \t]*(async\s+)?def\s+([a-zA-Z_]\w*)\s*\(/m;

    const match = functionPattern.exec(mask);

    if (!match) {
      return null;
    }

    const between = mask.slice(0, match.index);

    if (
      /^[ \t]*(?:class|def)\s+/m.test(between)
    ) {
      return null;
    }

    return {
      name: match[ 2 ],
      isAsync: Boolean(match[ 1 ])
    };
  }

  getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("FlaskRouteParser has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.httpMethods.clear();
  }
}
