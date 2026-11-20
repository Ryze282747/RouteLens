
export default class FlaskBlueprintResolver {
  constructor({ fileSystem = null } = {}) {
    this.fileSystem = fileSystem;
    this.destroyed = false;
  }

  async resolve(routes, workspace) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    if (!workspace?.root) {
      throw new Error("A valid workspace is required.");
    }

    // Without filesystem access, preserve the discovered routes.
    if (
      !this.fileSystem ||
      typeof this.fileSystem.findFiles !== "function" ||
      typeof this.fileSystem.readFile !== "function"
    ) {
      return routes;
    }

    const files = await this.fileSystem.findFiles(
      workspace.root,
      {
        extensions: [ ".py" ],
        exclude: [
          "node_modules",
          ".git",
          "venv",
          ".venv",
          "__pycache__"
        ]
      }
    );

    const blueprintDefinitions = new Map();
    const blueprintRegistrations = new Map();

    for (const file of files) {
      this.ensureActive();

      try {
        const content = await this.fileSystem.readFile(file);

        if (typeof content !== "string") {
          continue;
        }

        this.collectBlueprintDefinitions(
          content,
          blueprintDefinitions
        );

        this.collectBlueprintRegistrations(
          content,
          blueprintRegistrations
        );
      } catch (error) {
        console.error(
          `[RouteLens] Failed to resolve Blueprints in ${file}:`,
          error
        );
      }
    }

    return routes.flatMap((route) => {
      const blueprintName = route.blueprint;

      if (!blueprintName) {
        return [ route ];
      }

      const definition = blueprintDefinitions.get(
        blueprintName
      );

      if (!definition) {
        return [ route ];
      }

      const registrations =
        blueprintRegistrations.get(blueprintName) || [];

      if (registrations.length === 0) {
        return [
          {
            ...route,
            path: this.joinPaths(
              definition.urlPrefix,
              route.path
            ),
            metadata: {
              ...route.metadata,
              blueprintResolved: true,
              blueprintRegistered: false
            }
          }
        ];
      }

      return registrations.map((registration) => ({
        ...route,
        path: this.joinPaths(
          definition.urlPrefix,
          registration.urlPrefix,
          route.path
        ),
        metadata: {
          ...route.metadata,
          blueprintResolved: true,
          blueprintRegistered: true,
          registrationFile: registration.file
        }
      }));
    });
  }

  collectBlueprintDefinitions(content, definitions) {
    const pattern =
      /\b([a-zA-Z_]\w*)\s*=\s*Blueprint\s*\(/g;

    let match;

    while ((match = pattern.exec(content)) !== null) {
      const variableName = match[ 1 ];
      const openingIndex = pattern.lastIndex - 1;

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

      definitions.set(variableName, {
        variableName,
        urlPrefix: this.extractKeywordString(
          argumentsText,
          "url_prefix"
        )
      });

      pattern.lastIndex = closingIndex + 1;
    }
  }

  collectBlueprintRegistrations(content, registrations) {
    const pattern =
      /\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*\.register_blueprint\s*\(/g;

    let match;

    while ((match = pattern.exec(content)) !== null) {
      const openingIndex = pattern.lastIndex - 1;

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

      const blueprintName = this.extractFirstArgument(
        argumentsText
      );

      if (!blueprintName) {
        pattern.lastIndex = closingIndex + 1;
        continue;
      }

      const registration = {
        urlPrefix: this.extractKeywordString(
          argumentsText,
          "url_prefix"
        ),
        file: null
      };

      if (!registrations.has(blueprintName)) {
        registrations.set(blueprintName, []);
      }

      registrations.get(blueprintName).push(registration);

      pattern.lastIndex = closingIndex + 1;
    }
  }

  extractFirstArgument(argumentsText) {
    const match = argumentsText.match(
      /^\s*([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)/
    );

    if (!match) {
      return null;
    }

    return match[ 1 ].split(".").pop();
  }

  extractKeywordString(argumentsText, keyword) {
    const escapedKeyword = keyword.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const pattern = new RegExp(
      `\\b${escapedKeyword}\\s*=\\s*(['"])(.*?)\\1`,
      "s"
    );

    const match = argumentsText.match(pattern);

    return match ? match[ 2 ] : "";
  }

  findClosingParenthesis(content, openingIndex) {
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (
      let index = openingIndex;
      index < content.length;
      index++
    ) {
      const character = content[ index ];

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

      if (character === "'" || character === '"') {
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

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "FlaskBlueprintResolver has been destroyed."
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
