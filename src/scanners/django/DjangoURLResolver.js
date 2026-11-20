export default class DjangoURLResolver {
  constructor({ fileSystem = null } = {}) {
    this.fileSystem = fileSystem;
    this.destroyed = false;

    this.httpMethods = new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD",
      "TRACE"
    ]);

    this.classMethods = new Map([
      [ "get", "GET" ],
      [ "post", "POST" ],
      [ "put", "PUT" ],
      [ "patch", "PATCH" ],
      [ "delete", "DELETE" ],
      [ "options", "OPTIONS" ],
      [ "head", "HEAD" ],
      [ "trace", "TRACE" ]
    ]);

    this.genericViewMethods = new Map([
      [ "View", [] ],
      [ "TemplateView", [ "GET", "HEAD" ] ],
      [ "RedirectView", [ "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE" ] ],
      [ "ListView", [ "GET", "HEAD" ] ],
      [ "DetailView", [ "GET", "HEAD" ] ],
      [ "FormView", [ "GET", "HEAD", "POST" ] ],
      [ "CreateView", [ "GET", "HEAD", "POST" ] ],
      [ "UpdateView", [ "GET", "HEAD", "POST" ] ],
      [ "DeleteView", [ "GET", "HEAD", "POST" ] ],
      [ "ArchiveIndexView", [ "GET", "HEAD" ] ],
      [ "YearArchiveView", [ "GET", "HEAD" ] ],
      [ "MonthArchiveView", [ "GET", "HEAD" ] ],
      [ "WeekArchiveView", [ "GET", "HEAD" ] ],
      [ "DayArchiveView", [ "GET", "HEAD" ] ],
      [ "TodayArchiveView", [ "GET", "HEAD" ] ],
      [ "DateDetailView", [ "GET", "HEAD" ] ]
    ]);

    this.drfViewMethods = new Map([
      [ "APIView", [ "OPTIONS" ] ],
      [ "GenericAPIView", [ "OPTIONS" ] ],
      [ "ListModelMixin", [ "GET" ] ],
      [ "CreateModelMixin", [ "POST" ] ],
      [ "RetrieveModelMixin", [ "GET" ] ],
      [ "UpdateModelMixin", [ "PUT", "PATCH" ] ],
      [ "DestroyModelMixin", [ "DELETE" ] ],
      [ "ListCreateAPIView", [ "GET", "HEAD", "POST", "OPTIONS" ] ],
      [ "RetrieveAPIView", [ "GET", "HEAD", "OPTIONS" ] ],
      [ "RetrieveUpdateAPIView", [ "GET", "HEAD", "PUT", "PATCH", "OPTIONS" ] ],
      [ "RetrieveDestroyAPIView", [ "GET", "HEAD", "DELETE", "OPTIONS" ] ],
      [ "RetrieveUpdateDestroyAPIView", [ "GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS" ] ],
      [ "ListAPIView", [ "GET", "HEAD", "OPTIONS" ] ],
      [ "CreateAPIView", [ "POST", "OPTIONS" ] ],
      [ "ListCreateAPIView", [ "GET", "HEAD", "POST", "OPTIONS" ] ],
      [ "UpdateAPIView", [ "PUT", "PATCH", "OPTIONS" ] ],
      [ "DestroyAPIView", [ "DELETE", "OPTIONS" ] ],
      [ "ListCreateAPIView", [ "GET", "HEAD", "POST", "OPTIONS" ] ],
      [ "ModelViewSet", [ "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" ] ],
      [ "ReadOnlyModelViewSet", [ "GET", "HEAD", "OPTIONS" ] ],
      [ "ViewSet", [ "OPTIONS" ] ],
      [ "GenericViewSet", [ "OPTIONS" ] ]
    ]);

    this.drfMixinMethods = new Map([
      [ "ListModelMixin", [ "GET" ] ],
      [ "CreateModelMixin", [ "POST" ] ],
      [ "RetrieveModelMixin", [ "GET" ] ],
      [ "UpdateModelMixin", [ "PUT", "PATCH" ] ],
      [ "DestroyModelMixin", [ "DELETE" ] ]
    ]);
  }

  async resolve(routes, workspace) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    if (!workspace?.root) {
      throw new Error("A valid workspace is required.");
    }

    if (
      !this.fileSystem ||
      typeof this.fileSystem.readFile !== "function" ||
      typeof this.fileSystem.findFiles !== "function"
    ) {
      return routes;
    }

    const files = await this.discoverPythonFiles(workspace.root);
    const modules = await this.buildModuleIndex(files, workspace.root);

    const moduleFiles = new Map();
    const imports = new Map();

    for (const [ file, module ] of modules) {
      this.ensureActive();

      moduleFiles.set(module.moduleName, file);

      imports.set(
        file,
        this.findImports(module.content, module.moduleName)
      );
    }

    const edges = this.buildIncludeGraph({
      modules,
      imports,
      moduleFiles
    });

    const resolvedViews = this.resolveRouteViews({
      routes,
      modules,
      imports,
      moduleFiles
    });

    return this.applyPrefixes(resolvedViews, edges);
  }

  async discoverPythonFiles(root) {
    this.ensureActive();

    return this.fileSystem.findFiles(root, {
      extensions: [ ".py" ],
      exclude: [
        ".git",
        ".venv",
        "venv",
        "env",
        "__pycache__",
        "site-packages",
        "node_modules",
        "dist",
        "build"
      ],
      maxDepth: 30,
      maxFiles: 10000
    });
  }

  async buildModuleIndex(files, root) {
    const modules = new Map();

    for (const file of files) {
      this.ensureActive();

      let content;

      try {
        content = await this.fileSystem.readFile(file);
      } catch (error) {
        console.warn(
          `[RouteLens] Unable to read Django module: ${file}`,
          error
        );

        continue;
      }

      if (typeof content !== "string") {
        continue;
      }

      const relativePath = this.fileSystem.getRelativePath(
        root,
        file
      );

      const moduleName = this.fileToModuleName(relativePath);

      modules.set(file, {
        file,
        content,
        relativePath,
        moduleName,
        mask: this.createCodeMask(content)
      });
    }

    return modules;
  }

  fileToModuleName(filePath) {
    let value = String(filePath)
      .replace(/\\/g, "/")
      .replace(/\.py$/i, "")
      .replace(/\/+$/, "");

    if (value === "__init__") {
      return "";
    }

    if (value.endsWith("/__init__")) {
      value = value.slice(0, -11);
    }

    return value
      .split("/")
      .filter(Boolean)
      .join(".");
  }

  findImports(content, moduleName) {
    const source = this.createCodeMask(content);
    const imports = new Map();

    for (const line of source.split("\n")) {
      this.ensureActive();

      const fromImport = line.match(
        /^\s*from\s+([.\w]+)\s+import\s+(.+)$/
      );

      if (fromImport) {
        const importedModule = this.resolveRelativeModule(
          fromImport[ 1 ],
          moduleName
        );

        const names = fromImport[ 2 ].split(",");

        for (const name of names) {
          const match = name.trim().match(
            /^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/
          );

          if (!match) {
            continue;
          }

          const originalName = match[ 1 ];

          imports.set(match[ 2 ] || originalName, {
            module: importedModule,
            name: originalName
          });
        }

        continue;
      }

      const importStatement = line.match(
        /^\s*import\s+([\w.]+)(?:\s+as\s+([A-Za-z_]\w*))?/
      );

      if (importStatement) {
        const importedModule = importStatement[ 1 ];

        const alias = importStatement[ 2 ] ||
          importedModule.split(".")[ 0 ];

        imports.set(alias, {
          module: importedModule,
          name: null
        });
      }
    }

    return imports;
  }

  resolveRelativeModule(importedModule, currentModule) {
    if (!importedModule.startsWith(".")) {
      return importedModule;
    }

    const level = importedModule.match(/^\.+/)[ 0 ].length;
    const remainder = importedModule.slice(level);

    const parts = currentModule
      ? currentModule.split(".")
      : [];

    if (parts.length > 0) {
      parts.pop();
    }

    for (let index = 1; index < level; index++) {
      parts.pop();
    }

    if (remainder) {
      parts.push(...remainder.split("."));
    }

    return parts.join(".");
  }

  resolveRouteViews({
    routes,
    modules,
    imports,
    moduleFiles
  }) {
    return routes.map((route) => {
      this.ensureActive();

      const routeFile = route?.file;
      const routeModule = modules.get(routeFile);

      if (!routeModule) {
        return route;
      }

      const viewExpression = route.source?.view;

      if (!viewExpression) {
        return route;
      }

      const target = this.resolveViewTarget(
        viewExpression,
        routeFile,
        imports,
        moduleFiles
      );

      if (!target) {
        return route;
      }

      const targetModule = modules.get(target.file);

      if (!targetModule) {
        return route;
      }

      const targetImports = imports.get(target.file) || new Map();

      let viewInfo = null;

      if (target.className) {
        viewInfo = this.inspectClassView(
          targetModule.content,
          targetModule.mask,
          target.className,
          targetImports,
          modules,
          imports,
          moduleFiles
        );
      } else {
        viewInfo = this.inspectFunctionView(
          targetModule.content,
          targetModule.mask,
          target.functionName
        );

        // Some URL declarations reference a class without
        // explicitly using .as_view(). Try class resolution
        // if no matching function exists.
        if (!viewInfo) {
          viewInfo = this.inspectClassView(
            targetModule.content,
            targetModule.mask,
            target.functionName,
            targetImports,
            modules,
            imports,
            moduleFiles
          );
        }
      }

      if (!viewInfo) {
        return route;
      }

      const methods = viewInfo.methods.length
        ? viewInfo.methods
        : [ "ANY" ];

      return {
        ...route,
        methods,
        handler: viewExpression,
        metadata: {
          ...route.metadata,
          viewType: viewInfo.type,
          viewFile: target.file,
          viewResolved: true,
          methodsDetected: viewInfo.methods.length > 0,
          viewResolution: {
            module: targetModule.moduleName,
            functionName: target.functionName || null,
            className: target.className || null,
            decorators: viewInfo.decorators || [],
            inheritance: viewInfo.inheritance || [],
            resolutionConfidence: viewInfo.resolutionConfidence || "static"
          }
        }
      };
    });
  }

  resolveViewTarget(
    expression,
    currentFile,
    imports,
    moduleFiles
  ) {
    const value = String(expression).trim();

    const classMatch = value.match(
      /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.as_view\s*\(/
    );

    const isClass = Boolean(classMatch);
    const reference = isClass ? classMatch[ 1 ] : value;

    if (
      !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(reference)
    ) {
      return null;
    }

    const parts = reference.split(".");
    const first = parts[ 0 ];

    const currentImports = imports.get(currentFile) ||
      new Map();

    const imported = currentImports.get(first);

    if (imported) {
      const remaining = parts.slice(1);

      if (imported.name) {
        const possibleModule = [
          imported.module,
          imported.name
        ].filter(Boolean).join(".");

        const moduleFile = this.findModuleFile(
          possibleModule,
          moduleFiles
        );

        if (moduleFile && remaining.length > 0) {
          const targetName = remaining[ remaining.length - 1 ];

          return isClass
            ? { file: moduleFile, className: targetName }
            : { file: moduleFile, functionName: targetName };
        }

        if (remaining.length === 0) {
          const file = this.findModuleFile(
            imported.module,
            moduleFiles
          );

          if (!file) {
            return null;
          }

          return isClass
            ? { file, className: imported.name }
            : { file, functionName: imported.name };
        }

        return null;
      }

      const moduleName = [
        imported.module,
        ...remaining.slice(0, -1)
      ].filter(Boolean).join(".");

      const file = this.findModuleFile(
        moduleName,
        moduleFiles
      );

      if (!file) {
        return null;
      }

      const targetName = remaining.length
        ? remaining[ remaining.length - 1 ]
        : null;

      return isClass
        ? { file, className: targetName }
        : { file, functionName: targetName };
    }

    return null;
  }

  inspectFunctionView(content, mask, functionName) {
    const pattern = new RegExp(
      `^[ \\t]*(async\\s+)?def\\s+${this.escapeRegExp(functionName)}\\s*\\(`,
      "gm"
    );

    let match;

    while ((match = pattern.exec(mask)) !== null) {
      this.ensureActive();

      const lineStart = mask.lastIndexOf(
        "\n",
        match.index
      ) + 1;

      const indentation = this.getIndentation(
        mask.slice(lineStart, match.index)
      );

      if (indentation !== 0) {
        continue;
      }

      const decorators = this.findDecorators(
        content,
        mask,
        lineStart
      );

      const decoratorMethods = this.extractDecoratorMethods(
        decorators
      );

      const body = this.extractFunctionBody(
        mask,
        match.index,
        indentation
      );

      const bodyMethods = this.extractRequestMethods(body);

      const methods = this.combineMethods(
        decoratorMethods,
        bodyMethods
      );

      return {
        type: "function-based",
        methods,
        decorators
      };
    }

    return null;
  }

  inspectClassView(
    content,
    mask,
    className,
    moduleImports = new Map(),
    modules = new Map(),
    imports = new Map(),
    moduleFiles = new Map(),
    visited = new Set()
  ) {
    this.ensureActive();

    const visitKey = `${className}::${content.length}`;

    if (visited.has(visitKey)) {
      return null;
    }

    visited.add(visitKey);

    const definition = this.findClassDefinition(
      mask,
      className
    );

    if (!definition) {
      return null;
    }

    const methods = new Set();
    const inheritance = [];

    // Collect explicitly declared HTTP handlers.
    for (const methodName of definition.methods) {
      const method = this.classMethods.get(methodName);

      if (method) {
        methods.add(method);
      }
    }

    // Resolve inherited behavior.
    for (const base of definition.bases) {
      this.ensureActive();

      const resolvedBase = this.resolveBaseClass(
        base,
        moduleImports
      );

      if (!resolvedBase) {
        continue;
      }

      inheritance.push(resolvedBase.name);

      const builtInMethods = this.getBuiltInClassMethods(
        resolvedBase.qualifiedName,
        resolvedBase.name
      );

      for (const method of builtInMethods) {
        methods.add(method);
      }

      if (resolvedBase.file) {
        const baseModule = modules.get(resolvedBase.file);

        if (baseModule) {
          const baseImports = imports.get(resolvedBase.file) ||
            new Map();

          const inherited = this.inspectClassView(
            baseModule.content,
            baseModule.mask,
            resolvedBase.name,
            baseImports,
            modules,
            imports,
            moduleFiles,
            visited
          );

          if (inherited) {
            for (const method of inherited.methods) {
              methods.add(method);
            }

            inheritance.push(
              ...inherited.inheritance
            );
          }
        }
      }
    }

    return {
      type: "class-based",
      methods: [ ...methods ],
      decorators: [],
      inheritance: [ ...new Set(inheritance) ],
      resolutionConfidence: "static"
    };
  }

  findClassDefinition(mask, className) {
    const pattern = new RegExp(
      `^class\\s+${this.escapeRegExp(className)}\\b`,
      "gm"
    );

    const match = pattern.exec(mask);

    if (!match) {
      return null;
    }

    const classLineStart = mask.lastIndexOf(
      "\n",
      match.index
    ) + 1;

    const classIndent = this.getIndentation(
      mask.slice(classLineStart, match.index)
    );

    const headerEnd = mask.indexOf(":", match.index);

    if (headerEnd === -1) {
      return null;
    }

    const header = mask.slice(match.index, headerEnd + 1);

    const baseMatch = header.match(
      /^class\s+[A-Za-z_]\w*\s*\(([\s\S]*)\)\s*:/
    );

    const bases = baseMatch
      ? this.splitArguments(
        baseMatch[ 1 ],
        this.createCodeMask(baseMatch[ 1 ])
      )
      : [];

    const methods = [];
    let bodyIndent = null;

    let position = headerEnd + 1;

    while (position < mask.length) {
      this.ensureActive();

      const nextEnd = mask.indexOf("\n", position);

      const lineEnd = nextEnd === -1
        ? mask.length
        : nextEnd;

      const line = mask.slice(position, lineEnd);

      if (line.trim()) {
        const indentation = this.getIndentation(line);

        // Reached the next class or another statement
        // outside the current class.
        if (indentation <= classIndent) {
          break;
        }

        // Determine the direct class-body indentation.
        if (bodyIndent === null) {
          bodyIndent = indentation;
        }

        // Only collect methods directly inside this class.
        if (indentation === bodyIndent) {
          const methodMatch = line.match(
            /^[ \t]+(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/
          );

          if (methodMatch) {
            methods.push(methodMatch[ 1 ]);
          }
        }
      }

      position = lineEnd + 1;
    }

    return {
      start: match.index,
      bases: bases.map((base) => base.trim()).filter(Boolean),
      methods
    };
  }

  resolveBaseClass(baseExpression, moduleImports) {
    const base = String(baseExpression)
      .trim()
      .replace(/\s+/g, "");

    if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(base)) {
      return null;
    }

    const parts = base.split(".");
    const imported = moduleImports.get(parts[ 0 ]);

    if (!imported) {
      return {
        name: parts[ parts.length - 1 ],
        qualifiedName: base,
        file: null
      };
    }

    if (imported.name) {
      const remaining = parts.slice(1);

      if (remaining.length === 0) {
        return {
          name: imported.name,
          qualifiedName: `${imported.module}.${imported.name}`,
          moduleName: imported.module,
          file: null
        };
      }

      return {
        name: remaining[ remaining.length - 1 ],
        qualifiedName: [
          imported.module,
          imported.name,
          ...remaining
        ].filter(Boolean).join("."),
        file: null
      };
    }

    const remaining = parts.slice(1);

    return {
      name: remaining[ remaining.length - 1 ] || imported.module.split(".").pop(),
      qualifiedName: [
        imported.module,
        ...remaining
      ].filter(Boolean).join("."),
      file: null
    };
  }

  getBuiltInClassMethods(qualifiedName, className) {
    const methods = new Set();

    const normalized = String(qualifiedName || "")
      .replace(/^django\.views\.generic\./, "django.views.generic.")
      .replace(/^rest_framework\.generics\./, "rest_framework.generics.")
      .replace(/^rest_framework\.viewsets\./, "rest_framework.viewsets.")
      .replace(/^rest_framework\.views\./, "rest_framework.views.")
      .replace(/^rest_framework\.mixins\./, "rest_framework.mixins.");

    const djangoGeneric = normalized.startsWith(
      "django.views.generic."
    );

    const drfGeneric = normalized.startsWith(
      "rest_framework.generics."
    );

    const drfViewset = normalized.startsWith(
      "rest_framework.viewsets."
    );

    const drfMixin = normalized.startsWith(
      "rest_framework.mixins."
    );

    const drfAPIView = normalized === "rest_framework.views.APIView";

    if (djangoGeneric || this.genericViewMethods.has(className)) {
      const known = this.genericViewMethods.get(className) || [];

      for (const method of known) {
        methods.add(method);
      }
    }

    if (
      drfGeneric ||
      drfViewset ||
      drfAPIView ||
      drfMixin ||
      this.drfViewMethods.has(className)
    ) {
      const known = this.drfViewMethods.get(className) || [];

      for (const method of known) {
        methods.add(method);
      }

      const mixinMethods = this.drfMixinMethods.get(className) || [];

      for (const method of mixinMethods) {
        methods.add(method);
      }
    }

    return [ ...methods ];
  }

  extractFunctionBody(mask, functionIndex, indentation) {
    const lineStart = mask.lastIndexOf(
      "\n",
      functionIndex
    ) + 1;

    const headerEnd = mask.indexOf("\n", functionIndex);

    if (headerEnd === -1) {
      return "";
    }

    let position = headerEnd + 1;

    while (position < mask.length) {
      const nextEnd = mask.indexOf("\n", position);

      const end = nextEnd === -1
        ? mask.length
        : nextEnd;

      const line = mask.slice(position, end);

      if (line.trim()) {
        const currentIndentation = this.getIndentation(line);

        if (currentIndentation <= indentation) {
          return mask.slice(lineStart, position);
        }
      }

      position = end + 1;
    }

    return mask.slice(lineStart);
  }

  findDecorators(content, mask, functionLineStart) {
    const decorators = [];

    let position = functionLineStart - 1;

    while (position >= 0) {
      const previousLineStart = mask.lastIndexOf(
        "\n",
        position - 1
      ) + 1;

      const line = mask.slice(
        previousLineStart,
        position + 1
      );

      const trimmed = line.trim();

      if (!trimmed) {
        position = previousLineStart - 1;
        continue;
      }

      if (!trimmed.startsWith("@")) {
        break;
      }

      decorators.unshift(
        content.slice(
          previousLineStart,
          position + 1
        ).trim()
      );

      position = previousLineStart - 1;
    }

    return decorators;
  }

  extractDecoratorMethods(decorators) {
    const methods = new Set();

    for (const decorator of decorators) {
      this.ensureActive();

      const apiViewMatch = decorator.match(
        /@(?:[\w.]+\.)?api_view\s*\(\s*\[([\s\S]*?)\]\s*\)/
      );

      if (apiViewMatch) {
        this.extractMethodStrings(
          apiViewMatch[ 1 ],
          methods
        );
      }

      const simpleMatch = decorator.match(
        /@(?:[\w.]+\.)?(require_GET|require_POST|require_safe)\b/
      );

      if (simpleMatch) {
        if (simpleMatch[ 1 ] === "require_GET") {
          methods.add("GET");
        } else if (simpleMatch[ 1 ] === "require_POST") {
          methods.add("POST");
        } else if (simpleMatch[ 1 ] === "require_safe") {
          methods.add("GET");
          methods.add("HEAD");
        }
      }

      const httpMethodsMatch = decorator.match(
        /@(?:[\w.]+\.)?require_http_methods\s*\(\s*\[([\s\S]*?)\]\s*\)/
      );

      if (httpMethodsMatch) {
        this.extractMethodStrings(
          httpMethodsMatch[ 1 ],
          methods
        );
      }

      const httpMethodMatch = decorator.match(
        /@(?:[\w.]+\.)?require_http_method\s*\(\s*(['"])([A-Za-z]+)\1\s*\)/
      );

      if (httpMethodMatch) {
        this.addMethod(methods, httpMethodMatch[ 2 ]);
      }
    }

    return [ ...methods ];
  }

  extractRequestMethods(body) {
    const methods = new Set();

    const patterns = [
      /request\s*\.\s*method\s*==\s*(['"])([A-Za-z]+)\1/g,
      /(['"])([A-Za-z]+)\1\s*==\s*request\s*\.\s*method/g,
      /request\s*\.\s*method\s+in\s+(\[[^\]]*\]|\([^\)]*\))/g
    ];

    for (const pattern of patterns) {
      let match;

      while ((match = pattern.exec(body)) !== null) {
        if (pattern === patterns[ 2 ]) {
          this.extractMethodStrings(
            match[ 1 ],
            methods
          );
        } else {
          this.addMethod(
            methods,
            match[ 2 ]
          );
        }
      }
    }

    return [ ...methods ];
  }

  combineMethods(decoratorMethods, bodyMethods) {
    if (!decoratorMethods.length) {
      return bodyMethods;
    }

    if (!bodyMethods.length) {
      return decoratorMethods;
    }

    const bodySet = new Set(bodyMethods);

    return decoratorMethods.filter(
      (method) => bodySet.has(method)
    );
  }

  extractMethodStrings(value, methods) {
    const pattern = /(['"])([A-Za-z]+)\1/g;

    let match;

    while ((match = pattern.exec(value)) !== null) {
      this.addMethod(methods, match[ 2 ]);
    }
  }

  addMethod(methods, method) {
    const normalized = String(method).toUpperCase();

    if (this.httpMethods.has(normalized)) {
      methods.add(normalized);
    }
  }

  getIndentation(line) {
    const match = line.match(/^[ \t]*/);

    if (!match) {
      return 0;
    }

    return match[ 0 ].replace(/\t/g, "    ").length;
  }

  buildIncludeGraph({
    modules,
    imports,
    moduleFiles
  }) {
    const edges = new Map();

    for (const [ file, module ] of modules) {
      this.ensureActive();

      const moduleImports = imports.get(file) || new Map();

      const declarations = this.findPathIncludes(
        module.content
      );

      for (const declaration of declarations) {
        this.ensureActive();

        const target = this.resolveIncludeTarget(
          declaration.target,
          moduleImports,
          moduleFiles
        );

        if (!target) {
          continue;
        }

        if (!edges.has(target.file)) {
          edges.set(target.file, []);
        }

        edges.get(target.file).push({
          parentFile: file,
          childFile: target.file,
          prefix: declaration.prefix,
          variable: target.variable
        });
      }
    }

    return edges;
  }

  findPathIncludes(content) {
    const source = this.createCodeMask(content);
    const declarations = [];

    const pattern = /\b(?:path|re_path|url)\s*\(/g;

    let match;

    while ((match = pattern.exec(source)) !== null) {
      this.ensureActive();

      const openingIndex = source.indexOf(
        "(",
        match.index
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

      const argumentsMask = source.slice(
        openingIndex + 1,
        closingIndex
      );

      const args = this.splitArguments(
        argumentsText,
        argumentsMask
      );

      if (args.length < 2) {
        continue;
      }

      const prefix = this.extractString(args[ 0 ]);

      if (prefix === null) {
        continue;
      }

      const include = this.findIncludeCall(args[ 1 ]);

      if (!include) {
        continue;
      }

      declarations.push({
        prefix,
        target: include,
        line: this.getLineNumber(content, match.index)
      });

      pattern.lastIndex = closingIndex + 1;
    }

    return declarations;
  }

  findIncludeCall(expression) {
    if (typeof expression !== "string") {
      return null;
    }

    const source = this.createCodeMask(expression);
    const match = /\binclude\s*\(/.exec(source);

    if (!match) {
      return null;
    }

    const openingIndex = source.indexOf(
      "(",
      match.index
    );

    const closingIndex = this.findMatchingDelimiter(
      source,
      openingIndex,
      "(",
      ")"
    );

    if (closingIndex === -1) {
      return null;
    }

    const argumentsText = expression.slice(
      openingIndex + 1,
      closingIndex
    );

    const argumentsMask = source.slice(
      openingIndex + 1,
      closingIndex
    );

    const args = this.splitArguments(
      argumentsText,
      argumentsMask
    );

    if (!args.length) {
      return null;
    }

    const literal = this.extractString(args[ 0 ]);

    return literal !== null
      ? literal
      : args[ 0 ].trim();
  }

  resolveIncludeTarget(
    expression,
    imports,
    moduleFiles
  ) {
    if (!expression) {
      return null;
    }

    const value = String(expression).trim();

    const directFile = this.findModuleFile(
      value,
      moduleFiles
    );

    if (directFile) {
      return {
        file: directFile,
        variable: "urlpatterns"
      };
    }

    const parts = value.split(".");
    const first = parts[ 0 ];
    const imported = imports.get(first);

    if (!imported) {
      return null;
    }

    if (imported.name) {
      const remaining = parts.slice(1);

      const moduleName = [
        imported.module,
        ...remaining
      ].filter(Boolean).join(".");

      const file = this.findModuleFile(
        moduleName,
        moduleFiles
      );

      return file
        ? {
          file,
          variable: imported.name
        }
        : null;
    }

    const moduleName = [
      imported.module,
      ...parts.slice(1)
    ].filter(Boolean).join(".");

    const file = this.findModuleFile(
      moduleName,
      moduleFiles
    );

    return file
      ? {
        file,
        variable: "urlpatterns"
      }
      : null;
  }

  findModuleFile(moduleName, moduleFiles) {
    if (!moduleName) {
      return null;
    }

    const normalized = moduleName
      .replace(/\\/g, ".")
      .replace(/^\.+/, "")
      .replace(/\.+/g, ".");

    if (moduleFiles.has(normalized)) {
      return moduleFiles.get(normalized);
    }

    const packageFile = moduleFiles.get(
      `${normalized}.__init__`
    );

    if (packageFile) {
      return packageFile;
    }

    return null;
  }

  applyPrefixes(routes, edges) {
    const resolvedRoutes = [];

    for (const route of routes) {
      this.ensureActive();

      const routeFile = route?.file;

      if (!routeFile) {
        resolvedRoutes.push(route);
        continue;
      }

      const prefixes = this.findAllPrefixes(
        routeFile,
        edges
      );

      for (const prefix of prefixes) {
        this.ensureActive();

        const resolvedPath = this.joinPaths(
          prefix,
          route.path
        );

        resolvedRoutes.push({
          ...route,
          path: resolvedPath,
          metadata: {
            ...route.metadata,
            urlConfigResolved: true,
            urlPrefix: prefix
          }
        });
      }
    }

    return resolvedRoutes;
  }

  findAllPrefixes(targetFile, edges) {
    const results = [];
    const visited = new Set();

    const walk = (currentFile, prefix) => {
      this.ensureActive();

      const stateKey = `${currentFile}::${prefix}`;

      if (visited.has(stateKey)) {
        return;
      }

      visited.add(stateKey);

      const parents = edges.get(currentFile) || [];

      if (parents.length === 0) {
        results.push(prefix);
        return;
      }

      for (const edge of parents) {
        const combinedPrefix = this.joinPaths(
          edge.prefix,
          prefix
        );

        walk(
          edge.parentFile,
          combinedPrefix
        );
      }
    };

    walk(targetFile, "");

    return results.length
      ? [ ...new Set(results) ]
      : [ "" ];
  }

  extractString(value) {
    if (typeof value !== "string") {
      return null;
    }

    const match = value.trim().match(
      /^(?:r|u)?(['"])([\s\S]*)\1$/i
    );

    return match ? match[ 2 ] : null;
  }

  splitArguments(content, mask) {
    const parts = [];

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
        parts.push(
          content.slice(start, index).trim()
        );

        start = index + 1;
      }
    }

    const remaining = content.slice(start).trim();

    if (remaining) {
      parts.push(remaining);
    }

    return parts;
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

  findMatchingDelimiter(
    content,
    openingIndex,
    open,
    close
  ) {
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

  joinPaths(...segments) {
    const validSegments = segments.filter(
      (segment) =>
        typeof segment === "string" &&
        segment.trim() !== ""
    );

    if (!validSegments.length) {
      return "/";
    }

    const shouldEndWithSlash = validSegments[
      validSegments.length - 1
    ].trim().endsWith("/");

    const parts = validSegments
      .map((segment) =>
        segment.trim().replace(/^\/+|\/+$/g, "")
      )
      .filter(Boolean);

    if (!parts.length) {
      return "/";
    }

    const result = `/${parts.join("/")}`;

    return shouldEndWithSlash && result !== "/"
      ? `${result}/`
      : result;
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
        "DjangoURLResolver has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.fileSystem = null;
    this.httpMethods.clear();
    this.classMethods.clear();
    this.genericViewMethods.clear();
    this.drfViewMethods.clear();
    this.drfMixinMethods.clear();

    this.destroyed = true;
  }
}
