import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import ExpressRouterResolver from "../../../src/scanners/express/ExpressRouterResolver.js";

describe("ExpressRouterResolver", () => {
  let fileSystem;
  let resolver;

  const workspace = {
    root: "/project",
    name: "test-project"
  };

  const createRoute = (overrides = {}) => ({
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    framework: "express",
    handler: "getUsers",
    router: "userRouter",
    file: "/project/routes/users.js",
    line: 5,
    metadata: {},
    ...overrides
  });

  beforeEach(() => {
    fileSystem = {
      findFiles: vi.fn().mockResolvedValue([
        "/project/server.js",
        "/project/routes/users.js"
      ]),
      readFile: vi.fn()
    };

    resolver = new ExpressRouterResolver({
      fileSystem
    });
  });

  afterEach(() => {
    if (resolver && !resolver.destroyed) {
      resolver.destroy();
    }

    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should accept a filesystem adapter", () => {
      expect(resolver.fileSystem).toBe(fileSystem);
    });

    it("should allow construction without a filesystem adapter", () => {
      const instance = new ExpressRouterResolver();

      expect(instance.fileSystem).toBeNull();

      instance.destroy();
    });

    it("should initialize its lifecycle state", () => {
      expect(resolver.destroyed).toBe(false);
    });
  });

  describe("resolve()", () => {
    it("should require routes to be an array", async () => {
      await expect(
        resolver.resolve(null, workspace)
      ).rejects.toThrow(
        "Routes must be provided as an array."
      );
    });

    it("should require a valid workspace", async () => {
      await expect(
        resolver.resolve([], null)
      ).rejects.toThrow(
        "A valid workspace is required."
      );
    });

    it("should return routes unchanged without a filesystem adapter", async () => {
      const instance = new ExpressRouterResolver();
      const routes = [ createRoute() ];

      const result = await instance.resolve(
        routes,
        workspace
      );

      expect(result).toBe(routes);

      instance.destroy();
    });

    it("should return routes unchanged when filesystem methods are unavailable", async () => {
      const instance = new ExpressRouterResolver({
        fileSystem: {
          readFile: vi.fn()
        }
      });

      const routes = [ createRoute() ];

      const result = await instance.resolve(
        routes,
        workspace
      );

      expect(result).toBe(routes);

      instance.destroy();
    });

    it("should discover router definitions across workspace files", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/server.js"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "const userRouter = express.Router();"
      );

      const routes = [ createRoute() ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          extensions: expect.arrayContaining([
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs"
          ])
        })
      );

      expect(result).toHaveLength(1);
    });

    it("should resolve an Express Router definition", async () => {
      fileSystem.readFile.mockResolvedValue(
        "const userRouter = express.Router();"
      );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result).toHaveLength(1);
      expect(result[ 0 ]).toMatchObject({
        path: "/users",
        metadata: {
          routerResolved: true,
          routerMounted: false
        }
      });
    });

    it("should resolve a Router imported from express", async () => {
      fileSystem.readFile.mockResolvedValue(
        "const { Router } = require('express');\n" +
        "const userRouter = Router();"
      );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result[ 0 ]).toMatchObject({
        path: "/users",
        metadata: {
          routerResolved: true,
          routerMounted: false
        }
      });
    });

    it("should not modify routes without a matching router definition", async () => {
      fileSystem.readFile.mockResolvedValue(
        "const productRouter = express.Router();"
      );

      const route = createRoute();
      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result).toEqual([ route ]);
      expect(result[ 0 ]).toBe(route);
    });

    it("should resolve a mounted router prefix", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          "const userRouter = express.Router();"
        )
        .mockResolvedValueOnce(
          'app.use("/api/users", userRouter);'
        );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result).toHaveLength(1);
      expect(result[ 0 ].path).toBe("/api/users/users");
    });

    it("should record mount metadata", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          "const userRouter = express.Router();"
        )
        .mockResolvedValueOnce(
          'app.use("/api", userRouter);'
        );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result[ 0 ].metadata).toMatchObject({
        routerResolved: true,
        routerMounted: true,
        mountFile: "/project/routes/users.js"
      });
    });

    it("should support multiple mounts of the same router", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          "const userRouter = express.Router();"
        )
        .mockResolvedValueOnce(
          'app.use("/api/users", userRouter);\n' +
          'app.use("/v1/users", userRouter);'
        );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result).toHaveLength(2);

      expect(
        result.map(route => route.path)
      ).toEqual([
        "/api/users/users",
        "/v1/users/users"
      ]);
    });

    it("should preserve routes when a router has no mount", async () => {
      fileSystem.readFile.mockResolvedValue(
        "const userRouter = express.Router();"
      );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result[ 0 ].path).toBe("/users");
      expect(result[ 0 ].metadata.routerMounted).toBe(false);
    });

    it("should support mounts without a prefix", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          "const userRouter = express.Router();"
        )
        .mockResolvedValueOnce(
          "app.use(userRouter);"
        );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result).toHaveLength(1);
    });

    it("should support nested parentheses in mount arguments", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          "const userRouter = express.Router();"
        )
        .mockResolvedValueOnce(
          'app.use("/api", configure(userRouter));'
        );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result).toHaveLength(1);
    });

    it("should ignore mount calls without a router argument", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          "const userRouter = express.Router();"
        )
        .mockResolvedValueOnce(
          'app.use("/api");'
        );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result[ 0 ].metadata.routerMounted).toBe(false);
    });

    it("should preserve unrelated route metadata", async () => {
      fileSystem.readFile.mockResolvedValue(
        "const userRouter = express.Router();"
      );

      const route = createRoute({
        metadata: {
          custom: true,
          sourceType: "router"
        }
      });

      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result[ 0 ].metadata).toMatchObject({
        custom: true,
        sourceType: "router",
        routerResolved: true
      });
    });

    it("should preserve unrelated route properties", async () => {
      fileSystem.readFile.mockResolvedValue(
        "const userRouter = express.Router();"
      );

      const route = createRoute({
        customProperty: "preserved"
      });

      const result = await resolver.resolve(
        [ route ],
        workspace
      );

      expect(result[ 0 ].customProperty).toBe(
        "preserved"
      );
    });

    it("should continue when a router file cannot be read", async () => {
      const readError = new Error("Read failed");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.readFile
        .mockRejectedValueOnce(readError)
        .mockResolvedValueOnce(
          "const userRouter = express.Router();"
        );

      const result = await resolver.resolve(
        [ createRoute() ],
        workspace
      );

      expect(result[ 0 ]).toMatchObject({
        path: "/users",
        metadata: {
          routerResolved: true,
          routerMounted: false
        }
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to inspect router file: /project/server.js",
        readError
      );
    });

    it("should return an empty array when given an empty routes array", async () => {
      const result = await resolver.resolve(
        [],
        workspace
      );

      expect(result).toEqual([]);
    });

    it("should support multiple routes", async () => {
      fileSystem.readFile.mockResolvedValue(
        "const userRouter = express.Router();"
      );

      const routes = [
        createRoute(),
        createRoute({
          id: "route-2",
          path: "/users/:id",
          methods: [ "GET" ]
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toHaveLength(2);
    });

    it("should preserve routes when file discovery returns a non-array", async () => {
      fileSystem.findFiles.mockResolvedValue(null);

      const routes = [ createRoute() ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toBe(routes);
    });

    it("should propagate file discovery errors", async () => {
      fileSystem.findFiles.mockRejectedValue(
        new Error("Discovery failed")
      );

      await expect(
        resolver.resolve(
          [ createRoute() ],
          workspace
        )
      ).rejects.toThrow("Discovery failed");
    });

    it("should stop processing when destroyed during file discovery", async () => {
      fileSystem.findFiles.mockImplementation(async () => {
        resolver.destroy();
        return [];
      });

      await expect(
        resolver.resolve(
          [ createRoute() ],
          workspace
        )
      ).rejects.toThrow(
        "ExpressRouterResolver has been destroyed."
      );
    });
  });

  describe("collectRouterDefinitions()", () => {
    it("should collect express.Router declarations", () => {
      const definitions = new Map();

      resolver.collectRouterDefinitions(
        "const userRouter = express.Router();",
        "/project/routes/users.js",
        definitions
      );

      expect(definitions.get("userRouter")).toMatchObject({
        name: "userRouter",
        file: "/project/routes/users.js",
        prefix: ""
      });
    });

    it("should support let declarations", () => {
      const definitions = new Map();

      resolver.collectRouterDefinitions(
        "let userRouter = express.Router();",
        "/project/routes/users.js",
        definitions
      );

      expect(definitions.has("userRouter")).toBe(true);
    });

    it("should support var declarations", () => {
      const definitions = new Map();

      resolver.collectRouterDefinitions(
        "var userRouter = express.Router();",
        "/project/routes/users.js",
        definitions
      );

      expect(definitions.has("userRouter")).toBe(true);
    });

    it("should support imported Router declarations", () => {
      const definitions = new Map();

      resolver.collectRouterDefinitions(
        "const userRouter = Router();",
        "/project/routes/users.js",
        definitions
      );

      expect(definitions.has("userRouter")).toBe(true);
    });

    it("should support whitespace around Router calls", () => {
      const definitions = new Map();

      resolver.collectRouterDefinitions(
        "const userRouter = express . Router ();",
        "/project/routes/users.js",
        definitions
      );

      expect(definitions.has("userRouter")).toBe(true);
    });

    it("should ignore unrelated declarations", () => {
      const definitions = new Map();

      resolver.collectRouterDefinitions(
        "const app = express();",
        "/project/server.js",
        definitions
      );

      expect(definitions.size).toBe(0);
    });

    it("should collect multiple router definitions", () => {
      const definitions = new Map();

      resolver.collectRouterDefinitions(
        "const userRouter = express.Router();\n" +
        "const productRouter = express.Router();",
        "/project/routes.js",
        definitions
      );

      expect(definitions.size).toBe(2);
    });
  });

  describe("collectRouterMounts()", () => {
    it("should collect router mount prefixes", () => {
      const mounts = new Map();

      resolver.collectRouterMounts(
        'app.use("/api/users", userRouter);',
        "/project/server.js",
        mounts
      );

      expect(mounts.get("userRouter")).toEqual([
        {
          prefix: "/api/users",
          file: "/project/server.js"
        }
      ]);
    });

    it("should support single-quoted prefixes", () => {
      const mounts = new Map();

      resolver.collectRouterMounts(
        "app.use('/api/users', userRouter);",
        "/project/server.js",
        mounts
      );

      expect(mounts.get("userRouter")[ 0 ].prefix).toBe(
        "/api/users"
      );
    });

    it("should support template literal prefixes", () => {
      const mounts = new Map();

      resolver.collectRouterMounts(
        "app.use(`/api/users`, userRouter);",
        "/project/server.js",
        mounts
      );

      expect(mounts.get("userRouter")[ 0 ].prefix).toBe(
        "/api/users"
      );
    });

    it("should collect multiple mounts", () => {
      const mounts = new Map();

      resolver.collectRouterMounts(
        'app.use("/api", userRouter);\n' +
        'app.use("/v1", userRouter);',
        "/project/server.js",
        mounts
      );

      expect(mounts.get("userRouter")).toHaveLength(2);
    });

    it("should ignore calls without a router argument", () => {
      const mounts = new Map();

      resolver.collectRouterMounts(
        'app.use("/api");',
        "/project/server.js",
        mounts
      );

      expect(mounts.size).toBe(0);
    });

    it("should support nested function calls in arguments", () => {
      const mounts = new Map();

      resolver.collectRouterMounts(
        'app.use("/api", configure(userRouter));',
        "/project/server.js",
        mounts
      );

      expect(mounts.get("userRouter")).toBeDefined();
    });

    it("should support multiple mount calls on different application variables", () => {
      const mounts = new Map();

      resolver.collectRouterMounts(
        'app.use("/api", userRouter);\n' +
        'server.use("/v1", productRouter);',
        "/project/server.js",
        mounts
      );

      expect(mounts.has("userRouter")).toBe(true);
      expect(mounts.has("productRouter")).toBe(true);
    });
  });

  describe("extractRouterName()", () => {
    it("should extract a simple router variable", () => {
      expect(
        resolver.extractRouterName([ "userRouter" ])
      ).toBe("userRouter");
    });

    it("should extract a router from multiple arguments", () => {
      expect(
        resolver.extractRouterName([
          "middleware",
          "userRouter"
        ])
      ).toBe("userRouter");
    });

    it("should extract a router from a nested function call", () => {
      expect(
        resolver.extractRouterName([
          "configure(userRouter)"
        ])
      ).toBe("userRouter");
    });

    it("should reject empty arguments", () => {
      expect(
        resolver.extractRouterName([])
      ).toBeNull();
    });
  });

  describe("extractString()", () => {
    it("should extract double-quoted strings", () => {
      expect(
        resolver.extractString('"api"')
      ).toBe("api");
    });

    it("should extract single-quoted strings", () => {
      expect(
        resolver.extractString("'api'")
      ).toBe("api");
    });

    it("should extract template literals", () => {
      expect(
        resolver.extractString("`api`")
      ).toBe("api");
    });

    it("should return an empty string for non-string values", () => {
      expect(
        resolver.extractString("prefix")
      ).toBe("");
    });

    it("should return an empty string for empty input", () => {
      expect(
        resolver.extractString("")
      ).toBe("");
    });
  });

  describe("splitArguments()", () => {
    it("should split simple arguments", () => {
      expect(
        resolver.splitArguments(
          '"api", userRouter'
        )
      ).toEqual([
        '"api"',
        "userRouter"
      ]);
    });

    it("should preserve commas inside strings", () => {
      expect(
        resolver.splitArguments(
          '"api,users", userRouter'
        )
      ).toEqual([
        '"api,users"',
        "userRouter"
      ]);
    });

    it("should preserve commas inside nested calls", () => {
      expect(
        resolver.splitArguments(
          '"api", configure(userRouter, middleware)'
        )
      ).toEqual([
        '"api"',
        "configure(userRouter, middleware)"
      ]);
    });

    it("should support arrays and objects", () => {
      expect(
        resolver.splitArguments(
          '"api", { router: userRouter, enabled: true }'
        )
      ).toEqual([
        '"api"',
        "{ router: userRouter, enabled: true }"
      ]);
    });

    it("should return an empty array for empty input", () => {
      expect(
        resolver.splitArguments("")
      ).toEqual([]);
    });

    it("should ignore empty argument segments", () => {
      expect(
        resolver.splitArguments(
          '"api", , userRouter'
        )
      ).toEqual([
        '"api"',
        "userRouter"
      ]);
    });
  });

  describe("findClosingParenthesis()", () => {
    it("should find the matching closing parenthesis", () => {
      const content = 'app.use("/api", userRouter);';

      const openingIndex = content.indexOf("(");

      expect(
        resolver.findClosingParenthesis(
          content,
          openingIndex
        )
      ).toBe(content.indexOf(")"));
    });

    it("should support nested parentheses", () => {
      const content =
        'app.use("/api", configure(userRouter));';

      const openingIndex = content.indexOf("(");

      expect(
        content[
        resolver.findClosingParenthesis(
          content,
          openingIndex
        )
        ]
      ).toBe(")");
    });

    it("should ignore parentheses inside strings", () => {
      const content =
        'app.use("/api(test)", userRouter);';

      const openingIndex = content.indexOf("(");

      const closingIndex =
        resolver.findClosingParenthesis(
          content,
          openingIndex
        );

      expect(content[ closingIndex ]).toBe(")");
      expect(content.slice(0, closingIndex)).toContain(
        "/api(test)"
      );
    });

    it("should ignore parentheses inside line comments", () => {
      const content =
        'app.use("/api", // ) ignored\nuserRouter);';

      const openingIndex = content.indexOf("(");

      expect(
        content[
        resolver.findClosingParenthesis(
          content,
          openingIndex
        )
        ]
      ).toBe(")");
    });

    it("should ignore parentheses inside block comments", () => {
      const content =
        'app.use("/api", /* ) ignored */ userRouter);';

      const openingIndex = content.indexOf("(");

      expect(
        content[
        resolver.findClosingParenthesis(
          content,
          openingIndex
        )
        ]
      ).toBe(")");
    });

    it("should return -1 for unclosed parentheses", () => {
      const content = 'app.use("/api", userRouter;';

      const openingIndex = content.indexOf("(");

      expect(
        resolver.findClosingParenthesis(
          content,
          openingIndex
        )
      ).toBe(-1);
    });
  });

  describe("joinPaths()", () => {
    it("should join multiple path segments", () => {
      expect(
        resolver.joinPaths(
          "/api",
          "/users",
          "/:id"
        )
      ).toBe("/api/users/:id");
    });

    it("should normalize duplicate slashes", () => {
      expect(
        resolver.joinPaths(
          "///api///",
          "///users///"
        )
      ).toBe("/api/users");
    });

    it("should ignore empty segments", () => {
      expect(
        resolver.joinPaths(
          "",
          "/api",
          null,
          "/users"
        )
      ).toBe("/api/users");
    });

    it("should return a root path when all segments are empty", () => {
      expect(
        resolver.joinPaths("", null, undefined)
      ).toBe("/");
    });

    it("should trim whitespace around segments", () => {
      expect(
        resolver.joinPaths(
          " /api ",
          " /users "
        )
      ).toBe("/api/users");
    });

    it("should preserve route parameters", () => {
      expect(
        resolver.joinPaths(
          "/api",
          "/users/:id"
        )
      ).toBe("/api/users/:id");
    });
  });

  describe("lifecycle", () => {
    it("should throw when resolving after destruction", async () => {
      resolver.destroy();

      await expect(
        resolver.resolve([], workspace)
      ).rejects.toThrow(
        "ExpressRouterResolver has been destroyed."
      );
    });

    it("should be safe to destroy more than once", () => {
      resolver.destroy();

      expect(() => resolver.destroy()).not.toThrow();
    });

    it("should clear the filesystem adapter when destroyed", () => {
      resolver.destroy();

      expect(resolver.fileSystem).toBeNull();
      expect(resolver.destroyed).toBe(true);
    });
  });
});
