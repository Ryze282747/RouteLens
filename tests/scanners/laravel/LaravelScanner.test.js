import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import LaravelScanner from "../../../src/scanners/laravel/LaravelScanner.js";

describe("LaravelScanner", () => {
  let fileSystem;
  let parser;
  let groupResolver;
  let scanner;

  const workspace = {
    root: "/project",
    name: "test-project"
  };

  beforeEach(() => {
    fileSystem = {
      findFiles: vi.fn().mockResolvedValue([
        "/project/routes/web.php",
        "/project/app/Http/Controllers/UserController.php",
        "/project/app/Models/User.php"
      ]),
      readFile: vi.fn()
    };

    parser = {
      parse: vi.fn().mockResolvedValue([])
    };

    groupResolver = {
      resolve: vi.fn(async routes => routes)
    };

    scanner = new LaravelScanner({
      fileSystem,
      parser,
      groupResolver
    });
  });

  afterEach(() => {
    if (scanner && !scanner.destroyed) {
      scanner.destroy();
    }

    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should require a file system adapter", () => {
      expect(() => new LaravelScanner()).toThrow(
        "LaravelScanner requires a FileSystemAdapter."
      );
    });

    it("should initialize scanner metadata", () => {
      expect(scanner.id).toBe("laravel");
      expect(scanner.name).toBe("Laravel Scanner");
      expect(scanner.framework).toBe("laravel");
      expect(scanner.extensions).toEqual([ ".php" ]);
    });

    it("should use the provided parser", () => {
      expect(scanner.parser).toBe(parser);
    });

    it("should use the provided group resolver", () => {
      expect(scanner.groupResolver).toBe(groupResolver);
    });

    it("should mark injected dependencies as externally owned", () => {
      expect(scanner.ownsParser).toBe(false);
      expect(scanner.ownsGroupResolver).toBe(false);
    });

    it("should create a default parser when none is provided", () => {
      const instance = new LaravelScanner({
        fileSystem
      });

      expect(instance.parser).toBeDefined();
      expect(instance.parser).not.toBeNull();

      instance.destroy();
    });

    it("should create a default group resolver with the filesystem adapter", () => {
      const instance = new LaravelScanner({
        fileSystem
      });

      expect(instance.groupResolver).toBeDefined();
      expect(instance.groupResolver).not.toBeNull();
      expect(instance.groupResolver.fileSystem).toBe(fileSystem);

      instance.destroy();
    });

    it("should mark default dependencies as internally owned", () => {
      const instance = new LaravelScanner({
        fileSystem
      });

      expect(instance.ownsParser).toBe(true);
      expect(instance.ownsGroupResolver).toBe(true);

      instance.destroy();
    });
  });

  describe("supportsExtension()", () => {
    it("should support PHP files", () => {
      expect(
        scanner.supportsExtension("routes/web.php")
      ).toBe(true);
    });

    it("should reject unsupported extensions", () => {
      expect(scanner.supportsExtension("server.js")).toBe(false);
      expect(scanner.supportsExtension("app.py")).toBe(false);
      expect(scanner.supportsExtension("index.html")).toBe(false);
    });
  });

  describe("containsLaravelReference()", () => {
    it("should detect Laravel Route facade imports", () => {
      expect(
        scanner.containsLaravelReference(
          "use Illuminate\\Support\\Facades\\Route;"
        )
      ).toBe(true);
    });

    it("should detect Route facade calls", () => {
      expect(
        scanner.containsLaravelReference(
          "Route::get('/users', [UserController::class, 'index']);"
        )
      ).toBe(true);
    });

    it("should detect Laravel Application references", () => {
      expect(
        scanner.containsLaravelReference(
          "use Illuminate\\Foundation\\Application;"
        )
      ).toBe(true);
    });

    it("should detect Application configuration", () => {
      expect(
        scanner.containsLaravelReference(
          "Application::configure(basePath: dirname(__DIR__))"
        )
      ).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(
        scanner.containsLaravelReference(
          "route::get('/users', 'UserController@index');"
        )
      ).toBe(true);
    });

    it("should reject unrelated PHP code", () => {
      expect(
        scanner.containsLaravelReference(
          "<?php\nfunction add($a, $b) { return $a + $b; }"
        )
      ).toBe(false);
    });

    it("should handle empty content", () => {
      expect(
        scanner.containsLaravelReference("")
      ).toBe(false);
    });

    it("should reject non-string content", () => {
      expect(
        scanner.containsLaravelReference(null)
      ).toBe(false);

      expect(
        scanner.containsLaravelReference(undefined)
      ).toBe(false);
    });
  });

  describe("isPotentialRouteFile()", () => {
    it("should recognize Laravel route files", () => {
      expect(
        scanner.isPotentialRouteFile(
          "/project/routes/web.php",
          "<?php\nuse Illuminate\\Support\\Facades\\Route;\nRoute::get('/users', 'UserController@index');"
        )
      ).toBe(true);
    });

    it("should recognize Windows-style route file paths", () => {
      expect(
        scanner.isPotentialRouteFile(
          "C:\\project\\routes\\api.php",
          "<?php\nuse Illuminate\\Support\\Facades\\Route;\nRoute::get('/users', 'UserController@index');"
        )
      ).toBe(true);
    });

    it("should recognize Route facade declarations outside routes directories", () => {
      expect(
        scanner.isPotentialRouteFile(
          "/project/custom.php",
          "Route::get('/users', 'UserController@index');"
        )
      ).toBe(true);
    });

    it("should recognize Route group declarations", () => {
      expect(
        scanner.isPotentialRouteFile(
          "/project/custom.php",
          "Route::group(['prefix' => 'api'], function () {});"
        )
      ).toBe(true);
    });

    it("should reject unrelated PHP files", () => {
      expect(
        scanner.isPotentialRouteFile(
          "/project/app/Models/User.php",
          "<?php\nclass User {}"
        )
      ).toBe(false);
    });

    it("should reject unrelated files inside routes directories", () => {
      expect(
        scanner.isPotentialRouteFile(
          "/project/routes/web.php",
          "<?php\nclass RouteManager {}"
        )
      ).toBe(false);
    });

    it("should reject route-like words without a Route facade call", () => {
      expect(
        scanner.isPotentialRouteFile(
          "/project/app/Models/User.php",
          "class RouteManager {}"
        )
      ).toBe(false);
    });

    it("should handle non-string file paths", () => {
      expect(
        scanner.isPotentialRouteFile(
          null,
          "<?php\nRoute::get('/users', 'UserController@index');"
        )
      ).toBe(true);
    });
  });

  describe("detect()", () => {
    it("should detect Laravel through a Route facade reference", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/routes/web.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "<?php\nuse Illuminate\\Support\\Facades\\Route;\nRoute::get('/users', 'UserController@index');"
      );

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          extensions: [ ".php" ]
        })
      );

      expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
    });

    it("should detect Laravel through a Route facade reference outside routes directories", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/app/Providers/RouteServiceProvider.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "use Illuminate\\Support\\Facades\\Route;"
      );

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);
      expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
    });

    it("should detect Laravel through Application configuration", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/bootstrap/app.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "Application::configure(basePath: dirname(__DIR__))"
      );

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);
    });

    it("should return false when no PHP files are found", async () => {
      fileSystem.findFiles.mockResolvedValue([]);

      const result = await scanner.detect(workspace);

      expect(result).toBe(false);
      expect(fileSystem.readFile).not.toHaveBeenCalled();
    });

    it("should return false when file discovery returns a non-array", async () => {
      fileSystem.findFiles.mockResolvedValue(null);

      const result = await scanner.detect(workspace);

      expect(result).toBe(false);
    });

    it("should return false when the workspace has no root", async () => {
      const result = await scanner.detect({
        name: "invalid-workspace"
      });

      expect(result).toBe(false);
      expect(fileSystem.findFiles).not.toHaveBeenCalled();
    });

    it("should exclude Laravel dependency and storage directories", async () => {
      await scanner.detect(workspace);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          exclude: expect.arrayContaining([
            "vendor",
            "node_modules",
            ".git",
            "storage",
            "bootstrap/cache"
          ])
        })
      );
    });

    it("should continue inspecting files when reading fails", async () => {
      const readError = new Error("Unable to read file");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.findFiles.mockResolvedValue([
        "/project/app/First.php",
        "/project/app/Second.php"
      ]);

      fileSystem.readFile
        .mockRejectedValueOnce(readError)
        .mockResolvedValueOnce(
          "use Illuminate\\Support\\Facades\\Route;"
        );

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to inspect PHP file: /project/app/First.php",
        readError
      );
    });

    it("should return false when file discovery fails", async () => {
      const discoveryError = new Error("Discovery failed");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.findFiles.mockRejectedValue(discoveryError);

      const result = await scanner.detect(workspace);

      expect(result).toBe(false);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Laravel project detection failed:",
        discoveryError
      );
    });

    it("should return false when all files are unrelated PHP files", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/app/Models/User.php",
        "/project/app/Models/Product.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "<?php\nclass User {}"
      );

      const result = await scanner.detect(workspace);

      expect(result).toBe(false);
    });

    it("should not detect Laravel from a routes directory alone", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/routes/web.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "<?php\nfunction registerRoutes() {}"
      );

      const result = await scanner.detect(workspace);

      expect(result).toBe(false);
      expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
    });

    it("should stop when destroyed during file discovery", async () => {
      fileSystem.findFiles.mockImplementation(async () => {
        scanner.destroy();
        return [];
      });

      await expect(
        scanner.detect(workspace)
      ).rejects.toThrow(
        "Laravel Scanner has been destroyed."
      );
    });
  });

  describe("scan()", () => {
    it("should require a valid workspace", async () => {
      await expect(
        scanner.scan(null)
      ).rejects.toThrow("A valid workspace is required.");
    });

    it("should require a workspace root", async () => {
      await expect(
        scanner.scan({})
      ).rejects.toThrow("A valid workspace is required.");
    });

    it("should parse route files", async () => {
      fileSystem.readFile.mockResolvedValue(
        "<?php\nRoute::get('/users', 'UserController@index');"
      );

      await scanner.scan(workspace);

      expect(parser.parse).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          file: "/project/routes/web.php",
          workspace
        })
      );
    });

    it("should skip unrelated PHP files", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/app/Models/User.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "<?php\nclass User {}"
      );

      const result = await scanner.scan(workspace);

      expect(parser.parse).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("should parse files containing Route facade calls outside routes directories", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/custom/routes.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "Route::get('/users', 'UserController@index');"
      );

      await scanner.scan(workspace);

      expect(parser.parse).toHaveBeenCalledTimes(1);
    });

    it("should parse files containing Route group declarations", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/custom.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "Route::group(['prefix' => 'api'], function () {});"
      );

      await scanner.scan(workspace);

      expect(parser.parse).toHaveBeenCalledTimes(1);
    });

    it("should pass parsed routes through the group resolver", async () => {
      const parsedRoutes = [
        {
          path: "/users",
          methods: [ "GET" ],
          handler: "UserController@index",
          line: 5
        }
      ];

      fileSystem.readFile.mockResolvedValue(
        "<?php\nRoute::get('/users', 'UserController@index');"
      );

      parser.parse.mockResolvedValue(parsedRoutes);

      await scanner.scan(workspace);

      expect(groupResolver.resolve).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: "/users",
            methods: [ "GET" ],
            handler: "UserController@index",
            file: "/project/routes/web.php"
          })
        ]),
        workspace
      );
    });

    it("should return resolved routes", async () => {
      const resolvedRoutes = [
        {
          path: "/api/users",
          methods: [ "GET" ],
          handler: "UserController@index",
          framework: "laravel"
        }
      ];

      fileSystem.readFile.mockResolvedValue(
        "<?php\nRoute::get('/users', 'UserController@index');"
      );

      parser.parse.mockResolvedValue([
        {
          path: "/users",
          methods: [ "GET" ],
          handler: "UserController@index",
          line: 5
        }
      ]);

      groupResolver.resolve.mockResolvedValue(
        resolvedRoutes
      );

      const result = await scanner.scan(workspace);

      expect(result).toEqual(resolvedRoutes);
    });

    it("should return an empty array when no routes are found", async () => {
      fileSystem.readFile.mockResolvedValue(
        "<?php\nRoute::get('/users', 'UserController@index');"
      );

      parser.parse.mockResolvedValue([]);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
    });

    it("should pass custom exclusions to file discovery", async () => {
      const options = {
        exclude: [ "generated", "temporary" ]
      };

      await scanner.scan(workspace, options);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          extensions: [ ".php" ],
          exclude: [ "generated", "temporary" ]
        })
      );
    });

    it("should use default exclusions when none are provided", async () => {
      await scanner.scan(workspace);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          exclude: expect.arrayContaining([
            "vendor",
            "node_modules",
            ".git",
            "storage",
            "bootstrap/cache"
          ])
        })
      );
    });

    it("should return an empty array when file discovery returns a non-array", async () => {
      fileSystem.findFiles.mockResolvedValue(null);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(parser.parse).not.toHaveBeenCalled();
      expect(groupResolver.resolve).not.toHaveBeenCalled();
    });

    it("should propagate file discovery errors during scanning", async () => {
      fileSystem.findFiles.mockRejectedValue(
        new Error("Discovery failed")
      );

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow("Discovery failed");
    });

    it("should continue scanning when a file cannot be read", async () => {
      const readError = new Error("Unable to read file");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.findFiles.mockResolvedValue([
        "/project/routes/first.php",
        "/project/routes/second.php"
      ]);

      fileSystem.readFile
        .mockRejectedValueOnce(readError)
        .mockResolvedValueOnce(
          "Route::get('/users', 'UserController@index');"
        );

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(parser.parse).toHaveBeenCalledTimes(1);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to scan Laravel file: /project/routes/first.php",
        readError
      );
    });

    it("should skip files whose content is not a string", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/routes/web.php"
      ]);

      fileSystem.readFile.mockResolvedValue(null);

      const result = await scanner.scan(workspace);

      expect(parser.parse).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("should continue scanning when parsing a file fails", async () => {
      const parseError = new Error("Parsing failed");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.findFiles.mockResolvedValue([
        "/project/routes/first.php",
        "/project/routes/second.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "Route::get('/users', 'UserController@index');"
      );

      parser.parse
        .mockRejectedValueOnce(parseError)
        .mockResolvedValueOnce([]);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(parser.parse).toHaveBeenCalledTimes(2);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to scan Laravel file: /project/routes/first.php",
        parseError
      );
    });

    it("should use discovered routes if the resolver returns a non-array", async () => {
      fileSystem.findFiles.mockResolvedValue([
        "/project/routes/web.php"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "Route::get('/users', 'UserController@index');"
      );

      parser.parse.mockResolvedValue([
        {
          path: "/users",
          methods: [ "GET" ],
          handler: "UserController@index"
        }
      ]);

      groupResolver.resolve.mockResolvedValue(null);

      const result = await scanner.scan(workspace);

      expect(result).toHaveLength(1);

      expect(result[ 0 ]).toMatchObject({
        path: "/users",
        handler: "UserController@index"
      });
    });

    it("should stop when destroyed during file discovery", async () => {
      fileSystem.findFiles.mockImplementation(async () => {
        scanner.destroy();
        return [];
      });

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow(
        "Laravel Scanner has been destroyed."
      );
    });
  });

  describe("destroy()", () => {
    it("should mark the scanner as destroyed", () => {
      scanner.destroy();

      expect(scanner.destroyed).toBe(true);
    });

    it("should not destroy an injected parser", () => {
      parser.destroy = vi.fn();

      scanner.destroy();

      expect(parser.destroy).not.toHaveBeenCalled();
    });

    it("should not destroy an injected group resolver", () => {
      groupResolver.destroy = vi.fn();

      scanner.destroy();

      expect(groupResolver.destroy).not.toHaveBeenCalled();
    });

    it("should destroy an internally owned parser", () => {
      const instance = new LaravelScanner({
        fileSystem
      });

      const destroySpy = vi.spyOn(
        instance.parser,
        "destroy"
      );

      instance.destroy();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("should destroy an internally owned group resolver", () => {
      const instance = new LaravelScanner({
        fileSystem
      });

      const destroySpy = vi.spyOn(
        instance.groupResolver,
        "destroy"
      );

      instance.destroy();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("should clear dependencies after destruction", () => {
      scanner.destroy();

      expect(scanner.parser).toBeNull();
      expect(scanner.groupResolver).toBeNull();
      expect(scanner.fileSystem).toBeNull();
    });

    it("should be safe to call more than once", () => {
      scanner.destroy();

      expect(() => scanner.destroy()).not.toThrow();
    });
  });
});
