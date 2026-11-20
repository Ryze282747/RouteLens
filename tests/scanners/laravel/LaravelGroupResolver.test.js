import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import LaravelGroupResolver from "../../../src/scanners/laravel/LaravelGroupResolver.js";

describe("LaravelGroupResolver", () => {
  let fileSystem;
  let resolver;

  const workspace = {
    root: "/project",
    name: "test-project"
  };

  const createRoute = (overrides = {}) => ({
    method: "GET",
    path: "/users",
    file: "/project/routes/api.php",
    line: 10,
    metadata: {},
    ...overrides
  });

  beforeEach(() => {
    fileSystem = {
      readFile: vi.fn()
    };

    resolver = new LaravelGroupResolver({
      fileSystem
    });
  });

  afterEach(() => {
    resolver?.destroy();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should accept a filesystem adapter", () => {
      expect(resolver.fileSystem).toBe(fileSystem);
    });

    it("should allow construction without a filesystem adapter", () => {
      const instance = new LaravelGroupResolver();

      expect(instance.fileSystem).toBeNull();

      instance.destroy();
    });

    it("should initialize as active", () => {
      expect(resolver.destroyed).toBe(false);
    });
  });

  describe("resolve()", () => {
    it("should reject non-array routes", async () => {
      await expect(
        resolver.resolve(null, workspace)
      ).rejects.toThrow(
        "Routes must be provided as an array."
      );
    });

    it("should reject an invalid workspace", async () => {
      await expect(
        resolver.resolve([], null)
      ).rejects.toThrow(
        "A valid workspace is required."
      );
    });

    it("should reject a workspace without a root", async () => {
      await expect(
        resolver.resolve([], {})
      ).rejects.toThrow(
        "A valid workspace is required."
      );
    });

    it("should return the original routes when no filesystem exists", async () => {
      const instance = new LaravelGroupResolver();
      const routes = [ createRoute() ];

      const result = await instance.resolve(
        routes,
        workspace
      );

      expect(result).toBe(routes);

      instance.destroy();
    });

    it("should return the original routes when readFile is unavailable", async () => {
      const instance = new LaravelGroupResolver({
        fileSystem: {}
      });

      const routes = [ createRoute() ];

      const result = await instance.resolve(
        routes,
        workspace
      );

      expect(result).toBe(routes);

      instance.destroy();
    });

    it("should return an empty array when given no routes", async () => {
      const result = await resolver.resolve(
        [],
        workspace
      );

      expect(result).toEqual([]);
      expect(fileSystem.readFile).not.toHaveBeenCalled();
    });

    it("should read each unique route file only once", async () => {
      fileSystem.readFile.mockResolvedValue(
        "Route::get('/users', [UserController::class, 'index']);"
      );

      const routes = [
        createRoute({ line: 1 }),
        createRoute({ line: 2 }),
        createRoute({ line: 3 })
      ];

      await resolver.resolve(routes, workspace);

      expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
      expect(fileSystem.readFile).toHaveBeenCalledWith(
        "/project/routes/api.php"
      );
    });

    it("should read multiple different route files", async () => {
      fileSystem.readFile.mockResolvedValue("");

      const routes = [
        createRoute({
          file: "/project/routes/api.php"
        }),
        createRoute({
          file: "/project/routes/web.php"
        })
      ];

      await resolver.resolve(routes, workspace);

      expect(fileSystem.readFile).toHaveBeenCalledTimes(2);
    });

    it("should resolve a route inside a prefixed group", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "Route::prefix('api')->group(function () {",
          "    Route::get('/users', [UserController::class, 'index']);",
          "});"
        ].join("\n")
      );

      const result = await resolver.resolve(
        [ createRoute({ line: 2 }) ],
        workspace
      );

      expect(result[ 0 ].path).toBe("/api/users");
      expect(result[ 0 ].metadata).toMatchObject({
        groupResolved: true,
        groupCount: 1,
        groupPrefixes: [ "api" ]
      });
    });

    it("should resolve nested group prefixes", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "Route::group(['prefix' => 'api'], function () {",
          "    Route::group(['prefix' => 'v1'], function () {",
          "        Route::get('/users', [UserController::class, 'index']);",
          "    });",
          "});"
        ].join("\n")
      );

      const result = await resolver.resolve(
        [ createRoute({ line: 3 }) ],
        workspace
      );

      expect(result[ 0 ].path).toBe("/api/v1/users");
      expect(result[ 0 ].metadata).toMatchObject({
        groupResolved: true,
        groupCount: 2,
        groupPrefixes: [ "api", "v1" ]
      });
    });

    it("should resolve routes in sibling groups independently", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "Route::group(['prefix' => 'api'], function () {",
          "    Route::get('/users', [UserController::class, 'index']);",
          "});",
          "",
          "Route::group(['prefix' => 'admin'], function () {",
          "    Route::get('/users', [AdminController::class, 'index']);",
          "});"
        ].join("\n")
      );

      const result = await resolver.resolve(
        [
          createRoute({ line: 2 }),
          createRoute({ line: 6 })
        ],
        workspace
      );

      expect(result[ 0 ].path).toBe("/api/users");
      expect(result[ 1 ].path).toBe("/admin/users");
    });

    it("should preserve routes outside groups", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "Route::get('/health', [HealthController::class, 'index']);",
          "Route::group(['prefix' => 'api'], function () {",
          "    Route::get('/users', [UserController::class, 'index']);",
          "});"
        ].join("\n")
      );

      const routes = [
        createRoute({
          path: "/health",
          line: 1
        }),
        createRoute({
          path: "/users",
          line: 3
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result[ 0 ].path).toBe("/health");
      expect(result[ 0 ].metadata.groupCount).toBe(0);
      expect(result[ 1 ].path).toBe("/api/users");
    });

    it("should resolve a route declared on the same line as its group body", async () => {
      fileSystem.readFile.mockResolvedValue(
        "Route::group(['prefix' => 'api'], function () { Route::get('/users', [UserController::class, 'index']); });"
      );

      const result = await resolver.resolve(
        [ createRoute({ line: 1 }) ],
        workspace
      );

      expect(result[ 0 ].path).toBe("/api/users");
    });

    it("should preserve route order", async () => {
      fileSystem.readFile.mockResolvedValue("");

      const routes = [
        createRoute({ path: "/first", line: 1 }),
        createRoute({ path: "/second", line: 2 }),
        createRoute({ path: "/third", line: 3 })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result.map((route) => route.path)).toEqual([
        "/first",
        "/second",
        "/third"
      ]);
    });

    it("should preserve route properties", async () => {
      fileSystem.readFile.mockResolvedValue("");

      const route = createRoute({
        name: "users.index",
        controller: "UserController@index",
        middleware: [ "auth" ],
        customProperty: "custom-value",
        metadata: {
          source: "parser",
          custom: true
        }
      });

      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result[ 0 ]).toMatchObject({
        name: "users.index",
        controller: "UserController@index",
        middleware: [ "auth" ],
        customProperty: "custom-value",
        metadata: {
          source: "parser",
          custom: true,
          groupResolved: true,
          groupCount: 0,
          groupPrefixes: []
        }
      });
    });

    it("should preserve routes with missing file paths", async () => {
      const route = createRoute({
        file: undefined
      });

      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result).toEqual([ route ]);
      expect(fileSystem.readFile).not.toHaveBeenCalled();
    });

    it("should preserve routes with invalid line numbers", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "Route::group(['prefix' => 'api'], function () {",
          "    Route::get('/users', [UserController::class, 'index']);",
          "});"
        ].join("\n")
      );

      const route = createRoute({
        line: undefined
      });

      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result[ 0 ]).toBe(route);
    });

    it("should preserve routes when file content is not a string", async () => {
      fileSystem.readFile.mockResolvedValue(null);

      const route = createRoute();

      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result).toEqual([ route ]);
    });

    it("should preserve routes when reading a file fails", async () => {
      const error = new Error("Read failed");

      fileSystem.readFile.mockRejectedValue(error);

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      const route = createRoute();

      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result).toEqual([ route ]);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should continue resolving other files after one file fails", async () => {
      fileSystem.readFile
        .mockRejectedValueOnce(new Error("Read failed"))
        .mockResolvedValueOnce(
          [
            "Route::group(['prefix' => 'api'], function () {",
            "    Route::get('/users', [UserController::class, 'index']);",
            "});"
          ].join("\n")
        );

      const routes = [
        createRoute({
          file: "/project/routes/broken.php",
          path: "/broken",
          line: 1
        }),
        createRoute({
          file: "/project/routes/api.php",
          path: "/users",
          line: 2
        })
      ];

      vi.spyOn(console, "error").mockImplementation(() => { });

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result[ 0 ].path).toBe("/broken");
      expect(result[ 1 ].path).toBe("/api/users");
    });

    it("should preserve route metadata when no groups match", async () => {
      fileSystem.readFile.mockResolvedValue(
        "Route::get('/users', [UserController::class, 'index']);"
      );

      const route = createRoute({
        metadata: {
          source: "parser"
        }
      });

      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result[ 0 ].metadata).toEqual({
        source: "parser",
        groupResolved: true,
        groupCount: 0,
        groupPrefixes: []
      });
    });

    it("should preserve routes when the resolver is destroyed during file reading", async () => {
      let finishReading;

      fileSystem.readFile.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishReading = resolve;
          })
      );

      const pending = resolver.resolve(
        [ createRoute() ],
        workspace
      );

      await Promise.resolve();

      resolver.destroy();
      finishReading("");

      await expect(pending).rejects.toThrow(
        "LaravelGroupResolver has been destroyed."
      );
    });
  });

  describe("findGroups()", () => {
    it("should return an empty array for invalid content", () => {
      expect(resolver.findGroups(null)).toEqual([]);
      expect(resolver.findGroups(undefined)).toEqual([]);
      expect(resolver.findGroups(123)).toEqual([]);
    });

    it("should find a group with a prefix", () => {
      const content = [
        "Route::group(['prefix' => 'api'], function () {",
        "    Route::get('/users', [UserController::class, 'index']);",
        "});"
      ].join("\n");

      const groups = resolver.findGroups(content);

      expect(groups).toHaveLength(1);
      expect(groups[ 0 ]).toMatchObject({
        prefix: "api",
        startLine: 1,
        endLine: 3
      });
    });

    it("should find a group without a prefix", () => {
      const content = [
        "Route::group([], function () {",
        "    Route::get('/users', [UserController::class, 'index']);",
        "});"
      ].join("\n");

      const groups = resolver.findGroups(content);

      expect(groups).toHaveLength(1);
      expect(groups[ 0 ].prefix).toBe("");
    });

    it("should find nested groups", () => {
      const content = [
        "Route::group(['prefix' => 'api'], function () {",
        "    Route::group(['prefix' => 'v1'], function () {",
        "        Route::get('/users', [UserController::class, 'index']);",
        "    });",
        "});"
      ].join("\n");

      const groups = resolver.findGroups(content);

      expect(groups).toHaveLength(2);
      expect(groups.map((group) => group.prefix)).toEqual([
        "api",
        "v1"
      ]);
    });

    it("should ignore braces inside quoted strings when finding group boundaries", () => {
      const content = [
        "Route::group(['prefix' => 'api'], function () {",
        "    $value = '}';",
        "    Route::get('/users', [UserController::class, 'index']);",
        "});"
      ].join("\n");

      const groups = resolver.findGroups(content);

      expect(groups).toHaveLength(1);
      expect(groups[ 0 ].endLine).toBe(4);
    });

    it("should ignore braces inside line comments", () => {
      const content = [
        "Route::group(['prefix' => 'api'], function () {",
        "    // } this is not the end of the group",
        "    Route::get('/users', [UserController::class, 'index']);",
        "});"
      ].join("\n");

      const groups = resolver.findGroups(content);

      expect(groups).toHaveLength(1);
      expect(groups[ 0 ].endLine).toBe(4);
    });

    it("should ignore braces inside block comments", () => {
      const content = [
        "Route::group(['prefix' => 'api'], function () {",
        "    /* } this is not the end of the group */",
        "    Route::get('/users', [UserController::class, 'index']);",
        "});"
      ].join("\n");

      const groups = resolver.findGroups(content);

      expect(groups).toHaveLength(1);
      expect(groups[ 0 ].endLine).toBe(4);
    });

    it("should ignore braces inside hash comments", () => {
      const content = [
        "Route::group(['prefix' => 'api'], function () {",
        "    # } this is not the end of the group",
        "    Route::get('/users', [UserController::class, 'index']);",
        "});"
      ].join("\n");

      const groups = resolver.findGroups(content);

      expect(groups).toHaveLength(1);
      expect(groups[ 0 ].endLine).toBe(4);
    });

    it("should ignore braces inside backtick strings", () => {
      const content = [
        "Route::group(['prefix' => 'api'], function () {",
        "    $value = `echo '}'`;",
        "    Route::get('/users', [UserController::class, 'index']);",
        "});"
      ].join("\n");

      const groups = resolver.findGroups(content);

      expect(groups).toHaveLength(1);
      expect(groups[ 0 ].endLine).toBe(4);
    });

    it("should skip groups without a valid body", () => {
      const content =
        "Route::group(['prefix' => 'api'], function ();";

      expect(resolver.findGroups(content)).toEqual([]);
    });

    it("should skip groups with unmatched braces", () => {
      const content =
        "Route::group(['prefix' => 'api'], function () {";

      expect(resolver.findGroups(content)).toEqual([]);
    });

    it("should skip groups with unmatched argument delimiters", () => {
      const content =
        "Route::group(['prefix' => 'api', function () {";

      expect(resolver.findGroups(content)).toEqual([]);
    });
  });

  describe("findGroupBodyStart()", () => {
    it("should locate the opening body brace", () => {
      const content = "function () { return true; }";

      expect(
        resolver.findGroupBodyStart(content, 0)
      ).toBe(content.indexOf("{"));
    });

    it("should ignore braces inside strings", () => {
      const content = "'{' function () {";

      expect(
        resolver.findGroupBodyStart(content, 0)
      ).toBe(content.lastIndexOf("{"));
    });

    it("should ignore braces inside comments", () => {
      const content = [
        "// {",
        "/* { */",
        "function () {"
      ].join("\n");

      expect(
        resolver.findGroupBodyStart(content, 0)
      ).toBe(content.lastIndexOf("{"));
    });

    it("should return -1 when a statement ends before a body", () => {
      expect(
        resolver.findGroupBodyStart(
          "Route::get('/users');",
          0
        )
      ).toBe(-1);
    });
  });

  describe("findMatchingBrace()", () => {
    it("should find the matching closing brace", () => {
      const content = "{ nested { value(); } }";

      expect(
        resolver.findMatchingBrace(
          content,
          content.indexOf("{")
        )
      ).toBe(content.lastIndexOf("}"));
    });

    it("should ignore braces inside strings", () => {
      const content = "{ $value = '}'; }";

      expect(
        resolver.findMatchingBrace(content, 0)
      ).toBe(content.length - 1);
    });

    it("should ignore braces inside comments", () => {
      const content = [
        "{",
        "    // }",
        "    /* } */",
        "    # }",
        "    value();",
        "}"
      ].join("\n");

      expect(
        resolver.findMatchingBrace(content, 0)
      ).toBe(content.lastIndexOf("}"));
    });

    it("should return -1 when braces are unmatched", () => {
      expect(
        resolver.findMatchingBrace("{ nested {", 0)
      ).toBe(-1);
    });
  });

  describe("findClosingDelimiter()", () => {
    it("should find a matching closing parenthesis", () => {
      const content = "(first(second()))";

      expect(
        resolver.findClosingDelimiter(
          content,
          0,
          "(",
          ")"
        )
      ).toBe(content.length - 1);
    });

    it("should ignore delimiters inside strings", () => {
      const content = "(')')";

      expect(
        resolver.findClosingDelimiter(
          content,
          0,
          "(",
          ")"
        )
      ).toBe(content.length - 1);
    });

    it("should ignore delimiters inside comments", () => {
      const content = [
        "(",
        "    // )",
        "    /* ) */",
        "    value()",
        ")"
      ].join("\n");

      expect(
        resolver.findClosingDelimiter(
          content,
          0,
          "(",
          ")"
        )
      ).toBe(content.lastIndexOf(")"));
    });

    it("should return -1 for unmatched delimiters", () => {
      expect(
        resolver.findClosingDelimiter(
          "((value)",
          0,
          "(",
          ")"
        )
      ).toBe(-1);
    });
  });

  describe("extractPrefix()", () => {
    it("should extract a single-quoted prefix", () => {
      expect(
        resolver.extractPrefix(
          "['prefix' => 'api']"
        )
      ).toBe("api");
    });

    it("should extract a double-quoted prefix", () => {
      expect(
        resolver.extractPrefix(
          '["prefix" => "api"]'
        )
      ).toBe("api");
    });

    it("should extract a prefix containing slashes", () => {
      expect(
        resolver.extractPrefix(
          "['prefix' => '/api/v1/']"
        )
      ).toBe("/api/v1/");
    });

    it("should extract an empty prefix", () => {
      expect(
        resolver.extractPrefix(
          "['prefix' => '']"
        )
      ).toBe("");
    });

    it("should unescape quoted characters", () => {
      expect(
        resolver.extractPrefix(
          String.raw`['prefix' => 'api\'s']`
        )
      ).toBe("api's");
    });

    it("should return an empty string when no prefix exists", () => {
      expect(
        resolver.extractPrefix(
          "['middleware' => 'auth']"
        )
      ).toBe("");
    });

    it("should handle invalid input", () => {
      expect(resolver.extractPrefix(null)).toBe("");
      expect(resolver.extractPrefix(undefined)).toBe("");
      expect(resolver.extractPrefix(123)).toBe("");
    });
  });

  describe("joinPaths()", () => {
    it("should join multiple path segments", () => {
      expect(
        resolver.joinPaths("api", "v1", "users")
      ).toBe("/api/v1/users");
    });

    it("should remove leading and trailing slashes", () => {
      expect(
        resolver.joinPaths("/api/", "/v1/", "/users/")
      ).toBe("/api/v1/users");
    });

    it("should ignore empty segments", () => {
      expect(
        resolver.joinPaths("api", "", null, "users")
      ).toBe("/api/users");
    });

    it("should return root when no segments exist", () => {
      expect(resolver.joinPaths()).toBe("/");
    });

    it("should return root when all segments are empty", () => {
      expect(
        resolver.joinPaths("", " ", null, undefined)
      ).toBe("/");
    });
  });

  describe("getLineNumber()", () => {
    it("should return the first line for index zero", () => {
      expect(
        resolver.getLineNumber("first\nsecond", 0)
      ).toBe(1);
    });

    it("should calculate line numbers correctly", () => {
      const content = "first\nsecond\nthird";

      expect(
        resolver.getLineNumber(
          content,
          content.indexOf("third")
        )
      ).toBe(3);
    });

    it("should handle an empty string", () => {
      expect(
        resolver.getLineNumber("", 0)
      ).toBe(1);
    });
  });

  describe("lifecycle", () => {
    it("should destroy the resolver", () => {
      resolver.destroy();

      expect(resolver.destroyed).toBe(true);
      expect(resolver.fileSystem).toBeNull();
    });

    it("should safely destroy multiple times", () => {
      expect(() => {
        resolver.destroy();
        resolver.destroy();
      }).not.toThrow();

      expect(resolver.destroyed).toBe(true);
    });

    it("should reject resolve after destruction", async () => {
      resolver.destroy();

      await expect(
        resolver.resolve([], workspace)
      ).rejects.toThrow(
        "LaravelGroupResolver has been destroyed."
      );
    });

    it("should reject findGroups after destruction only indirectly through resolve", async () => {
      resolver.destroy();

      await expect(
        resolver.resolve(
          [ createRoute() ],
          workspace
        )
      ).rejects.toThrow(
        "LaravelGroupResolver has been destroyed."
      );
    });
  });
});
