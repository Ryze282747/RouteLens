
export default class NestJSRouteParser {
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
      "ALL",
      "SSE"
    ]);
  }

  async parse(content, context = {}) {
    this.ensureActive();

    if (typeof content !== "string") {
      throw new TypeError("Source content must be a string.");
    }

    const mask = this.createCodeMask(content);
    const controllers = this.parseControllers(
      content,
      mask,
      context
    );

    const routes = [];

    for (const controller of controllers) {
      this.ensureActive();

      const methods = this.parseControllerMethods(
        content,
        mask,
        controller,
        context
      );

      routes.push(...methods);
    }

    return routes;
  }

  parseControllers(content, mask, context) {
    const controllers = [];
    const classPattern =
      /\bclass\s+([a-zA-Z_$][\w$]*)\b/g;

    let match;

    while ((match = classPattern.exec(mask)) !== null) {
      this.ensureActive();

      const className = match[ 1 ];
      const classStart = match.index;

      const decorator = this.findControllerDecorator(
        content,
        mask,
        classStart
      );

      if (!decorator) {
        continue;
      }

      const bodyStart = mask.indexOf("{", classStart);

      if (bodyStart === -1) {
        continue;
      }

      const bodyEnd = this.findClosingDelimiter(
        mask,
        bodyStart,
        "{",
        "}"
      );

      if (bodyEnd === -1) {
        continue;
      }

      controllers.push({
        name: className,
        prefix: decorator.path,
        file: context.file || null,
        line: this.getLineNumber(content, decorator.start),
        classStart,
        bodyStart,
        bodyEnd,
        source: {
          type: "class-decorator",
          expression: content.slice(
            decorator.start,
            bodyStart + 1
          ).trim()
        },
        metadata: {
          parser: "nestjs",
          declaration: "@Controller"
        }
      });

      classPattern.lastIndex = bodyEnd + 1;
    }

    return controllers;
  }

  findControllerDecorator(content, mask, classStart) {
    const prefix = mask.slice(0, classStart);

    // Supports:
    // @Controller()
    // export class ExampleController
    //
    // @Controller("users")
    // export class UsersController
    //
    // @Controller("users")
    // export abstract class BaseController

    const pattern =
      /@Controller\s*(?:\(([\s\S]*?)\))?\s*(?:(?:export|abstract|declare)\s+)*$/;

    const match = prefix.match(pattern);

    if (!match) {
      return null;
    }

    const decoratorStart =
      classStart - match[ 0 ].length;

    // Extract the actual argument from source content.
    // The code mask intentionally removes string contents.
    const decoratorText = content.slice(
      decoratorStart,
      classStart
    );

    const argumentMatch = decoratorText.match(
      /@Controller\s*(?:\(([\s\S]*?)\))?/
    );

    const argumentsText = argumentMatch
      ? argumentMatch[ 1 ] || ""
      : "";

    return {
      start: decoratorStart,
      path: this.extractDecoratorPath(argumentsText)
    };
  }

  parseControllerMethods(
    content,
    mask,
    controller,
    context
  ) {
    const routes = [];

    const body = mask.slice(
      controller.bodyStart + 1,
      controller.bodyEnd
    );

    const methodPattern =
      /(?:^|\n)[ \t]*(?:@[a-zA-Z_$][\w$]*(?:\s*\([^)]*\))?[ \t]*\n[ \t]*)+((?:public|private|protected|static|readonly|async|override)\s+)*(?:async\s+)?([a-zA-Z_$][\w$]*)\s*(?:<[^>]*>\s*)?\(/g;

    let match;

    while ((match = methodPattern.exec(body)) !== null) {
      this.ensureActive();

      const methodName = match[ 2 ];

      if (
        methodName === "constructor" ||
        methodName === "if" ||
        methodName === "for" ||
        methodName === "while" ||
        methodName === "switch"
      ) {
        continue;
      }

      const relativeMethodName =
        match.index + match[ 0 ].lastIndexOf(methodName);

      const absoluteMethodName =
        controller.bodyStart + 1 + relativeMethodName;

      // Start at the beginning of the method declaration line.
      // This allows us to inspect the decorators immediately above it.
      const methodLineStart =
        mask.lastIndexOf("\n", absoluteMethodName - 1) + 1;

      const decoratorBlock = this.findMethodDecorators(
        content,
        mask,
        methodLineStart
      );

      if (!decoratorBlock.length) {
        continue;
      }

      const expressionEnd = this.findMethodExpressionEnd(
        mask,
        methodLineStart
      );

      for (const decorator of decoratorBlock) {
        if (!this.httpMethods.has(decorator.method)) {
          continue;
        }

        const methodPath = decorator.path;

        routes.push({
          path: methodPath,
          methods: this.expandMethod(decorator.method),
          handler: methodName,
          controller: controller.name,
          file: context.file || controller.file || null,
          line: this.getLineNumber(
            content,
            decorator.start
          ),
          source: {
            type: "method-decorator",
            expression: content.slice(
              decorator.start,
              expressionEnd
            ).trim()
          },
          metadata: {
            parser: "nestjs",
            declaration: `@${decorator.method}`,
            controller: controller.name,
            controllerPrefix: controller.prefix,
            methodPath
          }
        });
      }
    }

    return routes;
  }

  findMethodDecorators(content, mask, methodStart) {
    const beforeMethod = mask.slice(0, methodStart);
    const lines = beforeMethod.split("\n");

    const decorators = [];
    let index = lines.length - 1;
    let lineStart = beforeMethod.length;

    while (index >= 0) {
      const line = lines[ index ];
      const currentLineStart = lineStart - line.length;

      if (!line.trim()) {
        lineStart = currentLineStart - 1;
        index--;
        continue;
      }

      if (!line.trim().startsWith("@")) {
        break;
      }

      const decoratorName = line.match(
        /^\s*@([a-zA-Z_$][\w$]*)/
      );

      if (decoratorName) {
        const method = decoratorName[ 1 ].toUpperCase();

        if (this.httpMethods.has(method)) {
          const argumentMatch = line.match(
            /^\s*@[a-zA-Z_$][\w$]*\s*\(([\s\S]*)\)/
          );

          const originalLine = content.slice(
            currentLineStart,
            currentLineStart + line.length
          );

          const originalArgumentMatch = originalLine.match(
            /^\s*@[a-zA-Z_$][\w$]*\s*\(([\s\S]*)\)/
          );

          decorators.unshift({
            method,
            path: originalArgumentMatch
              ? this.extractDecoratorPath(
                originalArgumentMatch[ 1 ]
              )
              : "",
            start: currentLineStart
          });
        }
      }

      lineStart = currentLineStart - 1;
      index--;
    }

    return decorators;
  }

  extractDecoratorPath(argumentsText) {
    const value = argumentsText.trim();

    if (!value) {
      return "";
    }

    const match = value.match(
      /^(['"`])((?:\\.|(?!\1)[\s\S])*)\1/
    );

    if (!match) {
      return "";
    }

    const path = match[ 2 ];

    if (
      match[ 1 ] === "`" &&
      /\$\{[\s\S]*?\}/.test(path)
    ) {
      return "";
    }

    return path;
  }

  expandMethod(method) {
    if (method === "ALL") {
      return [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
        "HEAD"
      ];
    }

    if (method === "SSE") {
      return [ "GET" ];
    }

    return [ method ];
  }

  findMethodExpressionEnd(mask, start) {
    const openingIndex = mask.indexOf("{", start);

    if (openingIndex === -1) {
      return start;
    }

    const closingIndex = this.findClosingDelimiter(
      mask,
      openingIndex,
      "{",
      "}"
    );

    return closingIndex === -1
      ? openingIndex
      : closingIndex + 1;
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

  getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "NestJSRouteParser has been destroyed."
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
