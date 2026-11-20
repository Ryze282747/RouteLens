import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import FlaskBlueprintResolver from "../../../src/scanners/flask/FlaskBlueprintResolver.js";

describe("FlaskBlueprintResolver", () => {
  let resolver;
  let fileSystem;

  const workspace = {
    root: "/project",
    name: "test-project"
  };

  const createRoute = (overrides = {}) => ({
    path: "/users",
    methods: [ "GET" ],
    file: "/project/routes.py",
    framework: "flask",
    line: 10,
    handler: "get_users",
    ...overrides
  });

  beforeEach(() => {
    fileSystem = {
      findFiles: vi.fn().mockResolvedValue([
        "/project/app.py",
        "/project/routes.py"
      ]),
      readFile: vi.fn()
    };

    resolver = new FlaskBlueprintResolver({
      fileSystem
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with a filesystem adapter", () => {
      expect(resolver.fileSystem).toBe(fileSystem);
      expect(resolver.destroyed).toBe(false);
    });

    it("should allow construction without a filesystem adapter", () => {
      const instance = new FlaskBlueprintResolver();

      expect(instance.fileSystem).toBeNull();
      expect(instance.destroyed).toBe(false);
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

    it("should preserve routes when filesystem access is unavailable", async () => {
      const instance = new FlaskBlueprintResolver();
      const routes = [ createRoute() ];

      const result = await instance.resolve(
        routes,
        workspace
      );

      expect(result).toEqual(routes);
    });

    it("should preserve routes when filesystem methods are missing", async () => {
      const instance = new FlaskBlueprintResolver({
        fileSystem: {
          findFiles: vi.fn()
        }
      });

      const routes = [ createRoute() ];

      const result = await instance.resolve(
        routes,
        workspace
      );

      expect(result).toEqual(routes);
    });

    it("should discover Python files in the workspace", async () => {
      fileSystem.readFile.mockResolvedValue("");

      await resolver.resolve([], workspace);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          extensions: [ ".py" ]
        })
      );
    });

    it("should exclude dependency and virtual environment directories", async () => {
      fileSystem.readFile.mockResolvedValue("");

      await resolver.resolve([], workspace);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          exclude: expect.arrayContaining([
            "node_modules",
            ".git",
            "venv",
            ".venv",
            "__pycache__"
          ])
        })
      );
    });

    it("should return routes unchanged when no blueprint is assigned", async () => {
      fileSystem.readFile.mockResolvedValue("");

      const routes = [
        createRoute({
          blueprint: undefined
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toEqual(routes);
    });

    it("should resolve a blueprint URL prefix", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          'users_bp = Blueprint("users", __name__, url_prefix="/users")'
        )
        .mockResolvedValueOnce("");

      const routes = [
        createRoute({
          blueprint: "users_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toHaveLength(1);
      expect(result[ 0 ].path).toBe("/users/users");
      expect(result[ 0 ].metadata).toMatchObject({
        blueprintResolved: true,
        blueprintRegistered: false
      });
    });

    it("should resolve a blueprint registration prefix", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          'users_bp = Blueprint("users", __name__)'
        )
        .mockResolvedValueOnce(
          'app.register_blueprint(users_bp, url_prefix="/api")'
        );

      const routes = [
        createRoute({
          blueprint: "users_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toHaveLength(1);
      expect(result[ 0 ].path).toBe("/api/users");
      expect(result[ 0 ].metadata).toMatchObject({
        blueprintResolved: true,
        blueprintRegistered: true
      });
    });

    it("should combine blueprint and registration prefixes", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          'users_bp = Blueprint("users", __name__, url_prefix="/users")'
        )
        .mockResolvedValueOnce(
          'app.register_blueprint(users_bp, url_prefix="/api")'
        );

      const routes = [
        createRoute({
          blueprint: "users_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result[ 0 ].path).toBe("/users/api/users");
    });

    it("should resolve multiple registrations of the same blueprint", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          'users_bp = Blueprint("users", __name__)'
        )
        .mockResolvedValueOnce(
          [
            'app.register_blueprint(users_bp, url_prefix="/api")',
            'app.register_blueprint(users_bp, url_prefix="/v1")'
          ].join("\n")
        );

      const routes = [
        createRoute({
          blueprint: "users_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toHaveLength(2);

      expect(
        result.map(route => route.path)
      ).toEqual([
        "/api/users",
        "/v1/users"
      ]);
    });

    it("should preserve routes when the blueprint definition is missing", async () => {
      fileSystem.readFile.mockResolvedValue("");

      const routes = [
        createRoute({
          blueprint: "missing_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toEqual(routes);
    });

    it("should preserve a route when the blueprint has no registration", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          'users_bp = Blueprint("users", __name__, url_prefix="/users")'
        )
        .mockResolvedValueOnce("");

      const routes = [
        createRoute({
          blueprint: "users_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toHaveLength(1);
      expect(result[ 0 ].metadata).toMatchObject({
        blueprintResolved: true,
        blueprintRegistered: false
      });
    });

    it("should preserve routes with unrelated blueprint names", async () => {
      fileSystem.readFile.mockResolvedValue(
        'users_bp = Blueprint("users", __name__, url_prefix="/users")'
      );

      const routes = [
        createRoute({
          blueprint: "products_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toEqual(routes);
    });

    it("should skip files whose content is not a string", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("");

      const routes = [
        createRoute({
          blueprint: "users_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toEqual(routes);
    });

    it("should continue when a file cannot be read", async () => {
      const readError = new Error("Read failed");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.readFile
        .mockRejectedValueOnce(readError)
        .mockResolvedValueOnce(
          'users_bp = Blueprint("users", __name__, url_prefix="/users")'
        );

      const routes = [
        createRoute({
          blueprint: "users_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result[ 0 ].path).toBe("/users/users");

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to resolve Blueprints in /project/app.py:",
        readError
      );
    });

    it("should propagate file discovery errors", async () => {
      fileSystem.findFiles.mockRejectedValue(
        new Error("Discovery failed")
      );

      await expect(
        resolver.resolve([], workspace)
      ).rejects.toThrow("Discovery failed");
    });

    it("should handle an empty file list", async () => {
      fileSystem.findFiles.mockResolvedValue([]);

      const routes = [
        createRoute({
          blueprint: "users_bp"
        })
      ];

      const result = await resolver.resolve(
        routes,
        workspace
      );

      expect(result).toEqual(routes);
    });
  });

  describe("extractFirstArgument()", () => {
    it("should extract a simple blueprint variable", () => {
      expect(
        resolver.extractFirstArgument(
          "users_bp, url_prefix='/api'"
        )
      ).toBe("users_bp");
    });

    it("should extract the final name from a qualified reference", () => {
      expect(
        resolver.extractFirstArgument(
          "blueprints.users_bp, url_prefix='/api'"
        )
      ).toBe("users_bp");
    });

    it("should return null for invalid arguments", () => {
      expect(
        resolver.extractFirstArgument("")
      ).toBeNull();

      expect(
        resolver.extractFirstArgument("None")
      ).toBe("None");
    });
  });

  describe("extractKeywordString()", () => {
    it("should extract a single-quoted keyword value", () => {
      expect(
        resolver.extractKeywordString(
          "url_prefix='/api'",
          "url_prefix"
        )
      ).toBe("/api");
    });

    it("should extract a double-quoted keyword value", () => {
      expect(
        resolver.extractKeywordString(
          'url_prefix="/api"',
          "url_prefix"
        )
      ).toBe("/api");
    });

    it("should return an empty string when the keyword is missing", () => {
      expect(
        resolver.extractKeywordString(
          "name='users'",
          "url_prefix"
        )
      ).toBe("");
    });

    it("should handle an empty keyword value", () => {
      expect(
        resolver.extractKeywordString(
          "url_prefix=''",
          "url_prefix"
        )
      ).toBe("");
    });
  });

  describe("findClosingParenthesis()", () => {
    it("should find a matching closing parenthesis", () => {
      const content = "Blueprint('users', __name__)";

      expect(
        resolver.findClosingParenthesis(
          content,
          content.indexOf("(")
        )
      ).toBe(content.length - 1);
    });

    it("should handle nested parentheses", () => {
      const content = "Blueprint(factory('users'), __name__)";

      expect(
        resolver.findClosingParenthesis(
          content,
          content.indexOf("(")
        )
      ).toBe(content.length - 1);
    });

    it("should ignore parentheses inside strings", () => {
      const content = 'Blueprint("users(test)", __name__)';

      expect(
        resolver.findClosingParenthesis(
          content,
          content.indexOf("(")
        )
      ).toBe(content.length - 1);
    });

    it("should handle escaped quotes", () => {
      const content = `Blueprint("user\\"s", __name__)`;

      expect(
        resolver.findClosingParenthesis(
          content,
          content.indexOf("(")
        )
      ).toBe(content.length - 1);
    });

    it("should return -1 when parentheses are unmatched", () => {
      expect(
        resolver.findClosingParenthesis(
          "Blueprint('users'",
          9
        )
      ).toBe(-1);
    });
  });

  describe("joinPaths()", () => {
    it("should join multiple path segments", () => {
      expect(
        resolver.joinPaths(
          "/api/",
          "/users/",
          "/active/"
        )
      ).toBe("/api/users/active");
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

    it("should return root for empty segments", () => {
      expect(
        resolver.joinPaths("", null, undefined)
      ).toBe("/");
    });

    it("should trim whitespace around segments", () => {
      expect(
        resolver.joinPaths(
          " /api/ ",
          " /users "
        )
      ).toBe("/api/users");
    });
  });

  describe("lifecycle", () => {
    it("should reject resolution after destruction", async () => {
      resolver.destroy();

      await expect(
        resolver.resolve([], workspace)
      ).rejects.toThrow(
        "FlaskBlueprintResolver has been destroyed."
      );
    });

    it("should clear the filesystem reference after destruction", () => {
      resolver.destroy();

      expect(resolver.fileSystem).toBeNull();
      expect(resolver.destroyed).toBe(true);
    });

    it("should allow repeated destruction", () => {
      resolver.destroy();

      expect(() => resolver.destroy()).not.toThrow();
    });
  });
});
