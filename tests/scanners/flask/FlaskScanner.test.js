import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import FlaskScanner from "../../../src/scanners/flask/FlaskScanner.js";

describe("FlaskScanner", () => {
  let fileSystem;
  let parser;
  let blueprintResolver;
  let scanner;

  const workspace = {
    root: "/project",
    name: "test-project"
  };

  beforeEach(() => {
    fileSystem = {
      findFiles: vi.fn().mockResolvedValue([
        "/project/app.py",
        "/project/routes.py"
      ]),
      readFile: vi.fn()
    };

    parser = {
      parse: vi.fn().mockResolvedValue([])
    };

    blueprintResolver = {
      resolve: vi.fn(async routes => routes)
    };

    scanner = new FlaskScanner({
      fileSystem,
      parser,
      blueprintResolver
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
      expect(() => new FlaskScanner()).toThrow();
    });

    it("should require filesystem methods", () => {
      expect(() => new FlaskScanner({
        fileSystem: {}
      })).toThrow(
        "FileSystemAdapter must implement findFiles() and readFile()."
      );
    });

    it("should initialize scanner metadata", () => {
      expect(scanner.id).toBe("flask");
      expect(scanner.name).toBe("Flask Scanner");
      expect(scanner.framework).toBe("flask");
      expect(scanner.extensions).toContain(".py");
    });

    it("should use the provided parser", () => {
      expect(scanner.parser).toBe(parser);
      expect(scanner.ownsParser).toBe(false);
    });

    it("should use the provided blueprint resolver", () => {
      expect(scanner.blueprintResolver).toBe(blueprintResolver);
      expect(scanner.ownsBlueprintResolver).toBe(false);
    });

    it("should create a default parser when none is provided", () => {
      const instance = new FlaskScanner({
        fileSystem,
        blueprintResolver
      });

      expect(instance.parser).toBeDefined();
      expect(instance.ownsParser).toBe(true);

      instance.destroy();
    });

    it("should create a default resolver with the filesystem adapter", () => {
      const instance = new FlaskScanner({
        fileSystem,
        parser
      });

      expect(instance.blueprintResolver).toBeDefined();
      expect(instance.blueprintResolver.fileSystem).toBe(fileSystem);
      expect(instance.ownsBlueprintResolver).toBe(true);

      instance.destroy();
    });

    it("should create and own both default dependencies", () => {
      const instance = new FlaskScanner({
        fileSystem
      });

      expect(instance.ownsParser).toBe(true);
      expect(instance.ownsBlueprintResolver).toBe(true);

      expect(instance.parser).toBeDefined();
      expect(instance.blueprintResolver).toBeDefined();

      instance.destroy();
    });

    it("should reject a parser without parse()", () => {
      expect(() => new FlaskScanner({
        fileSystem,
        parser: {}
      })).toThrow(
        "FlaskRouteParser must implement parse()."
      );
    });

    it("should reject a resolver without resolve()", () => {
      expect(() => new FlaskScanner({
        fileSystem,
        blueprintResolver: {}
      })).toThrow(
        "FlaskBlueprintResolver must implement resolve()."
      );
    });
  });

  describe("supportsExtension()", () => {
    it("should support Python files", () => {
      expect(scanner.supportsExtension("app.py")).toBe(true);
    });

    it("should reject unsupported file extensions", () => {
      expect(scanner.supportsExtension("app.js")).toBe(false);
      expect(scanner.supportsExtension("index.php")).toBe(false);
    });
  });

  describe("containsFlaskReference()", () => {
    it("should detect Flask imports", () => {
      expect(
        scanner.containsFlaskReference(
          "from flask import Flask"
        )
      ).toBe(true);
    });

    it("should detect Flask application instances", () => {
      expect(
        scanner.containsFlaskReference(
          "app = Flask(__name__)"
        )
      ).toBe(true);
    });

    it("should detect Flask Blueprint references", () => {
      expect(
        scanner.containsFlaskReference(
          "from flask import Blueprint"
        )
      ).toBe(true);
    });

    it("should reject files without Flask references", () => {
      expect(
        scanner.containsFlaskReference(
          "def add(a, b):\n    return a + b"
        )
      ).toBe(false);
    });

    it("should handle empty content", () => {
      expect(scanner.containsFlaskReference("")).toBe(false);
    });

    it("should handle non-string content", () => {
      expect(scanner.containsFlaskReference(null)).toBe(false);
      expect(scanner.containsFlaskReference(undefined)).toBe(false);
      expect(scanner.containsFlaskReference({})).toBe(false);
    });
  });

  describe("detect()", () => {
    it("should detect a Flask workspace", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce("from flask import Flask")
        .mockResolvedValueOnce("from flask import Blueprint");

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          extensions: [ ".py" ]
        })
      );
    });

    it("should return false when no Flask references are found", async () => {
      fileSystem.readFile.mockResolvedValue(
        "def add(a, b): return a + b"
      );

      const result = await scanner.detect(workspace);

      expect(result).toBe(false);
    });

    it("should stop after finding a Flask reference", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce("from flask import Flask")
        .mockResolvedValueOnce("from flask import Blueprint");

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);
      expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
    });

    it("should exclude common dependency and virtual environment directories", async () => {
      await scanner.detect(workspace);

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

    it("should return false when file discovery returns a non-array", async () => {
      fileSystem.findFiles.mockResolvedValue(null);

      const result = await scanner.detect(workspace);

      expect(result).toBe(false);
    });

    it("should return false when the workspace is invalid", async () => {
      expect(await scanner.detect(null)).toBe(false);
      expect(await scanner.detect({})).toBe(false);
      expect(await scanner.detect({ root: "" })).toBe(false);

      expect(fileSystem.findFiles).not.toHaveBeenCalled();
    });

    it("should skip invalid file paths", async () => {
      fileSystem.findFiles.mockResolvedValue([
        null,
        "",
        "/project/app.py"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);
      expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
      expect(fileSystem.readFile).toHaveBeenCalledWith(
        "/project/app.py"
      );
    });

    it("should propagate file discovery errors", async () => {
      fileSystem.findFiles.mockRejectedValue(
        new Error("Unable to scan workspace")
      );

      await expect(
        scanner.detect(workspace)
      ).rejects.toThrow("Unable to scan workspace");
    });

    it("should propagate file read errors", async () => {
      fileSystem.readFile.mockRejectedValue(
        new Error("Unable to read file")
      );

      await expect(
        scanner.detect(workspace)
      ).rejects.toThrow("Unable to read file");
    });
  });

  describe("scan()", () => {
    it("should parse Python files in the workspace", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce("from flask import Flask")
        .mockResolvedValueOnce("from flask import Blueprint");

      await scanner.scan(workspace);

      expect(parser.parse).toHaveBeenCalledTimes(2);

      expect(parser.parse).toHaveBeenCalledWith(
        "from flask import Flask",
        expect.objectContaining({
          file: "/project/app.py",
          workspace
        })
      );
    });

    it("should pass parsed routes through the blueprint resolver", async () => {
      const parsedRoutes = [
        {
          path: "/",
          methods: [ "GET" ],
          handler: "home",
          file: "/project/app.py",
          line: 3
        }
      ];

      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      parser.parse.mockResolvedValue(parsedRoutes);

      await scanner.scan(workspace);

      expect(blueprintResolver.resolve).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: "/",
            methods: [ "GET" ],
            handler: "home",
            file: "/project/app.py"
          })
        ]),
        workspace
      );
    });

    it("should return resolved routes", async () => {
      const resolvedRoutes = [
        {
          path: "/",
          methods: [ "GET" ],
          handler: "home",
          framework: "flask"
        }
      ];

      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      parser.parse.mockResolvedValue([
        {
          path: "/",
          methods: [ "GET" ],
          handler: "home",
          file: "/project/app.py",
          line: 3
        }
      ]);

      blueprintResolver.resolve.mockResolvedValue(
        resolvedRoutes
      );

      const result = await scanner.scan(workspace);

      expect(result).toEqual(resolvedRoutes);
    });

    it("should return an empty array when no routes are found", async () => {
      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      parser.parse.mockResolvedValue([]);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
    });

    it("should pass supported scan options to file discovery", async () => {
      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      const options = {
        exclude: [ "build", "coverage" ]
      };

      await scanner.scan(workspace, options);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          extensions: [ ".py" ],
          exclude: [ "build", "coverage" ]
        })
      );
    });

    it("should use default exclusions when none are provided", async () => {
      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      await scanner.scan(workspace);

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

    it("should propagate file discovery errors", async () => {
      fileSystem.findFiles.mockRejectedValue(
        new Error("Discovery failed")
      );

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow("Discovery failed");
    });

    it("should reject non-array file discovery results", async () => {
      fileSystem.findFiles.mockResolvedValue(null);

      await expect(
        scanner.scan(workspace)
      ).rejects.toThrow(
        "FileSystemAdapter.findFiles() must return an array."
      );
    });

    it("should reject invalid workspaces", async () => {
      await expect(
        scanner.scan(null)
      ).rejects.toThrow("A valid workspace is required.");

      await expect(
        scanner.scan({})
      ).rejects.toThrow("A valid workspace is required.");
    });

    it("should reject invalid scan options", async () => {
      await expect(
        scanner.scan(workspace, null)
      ).rejects.toThrow("Scan options must be an object.");

      await expect(
        scanner.scan(workspace, [])
      ).rejects.toThrow("Scan options must be an object.");
    });

    it("should continue scanning when a file cannot be read", async () => {
      const readError = new Error("Unable to read file");
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.readFile
        .mockRejectedValueOnce(readError)
        .mockResolvedValueOnce("from flask import Flask");

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(parser.parse).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to scan Flask file: /project/app.py",
        readError
      );
    });

    it("should skip files whose content is not a string", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("from flask import Flask");

      const result = await scanner.scan(workspace);

      expect(parser.parse).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });

    it("should skip invalid file paths", async () => {
      fileSystem.findFiles.mockResolvedValue([
        null,
        "",
        "/project/app.py"
      ]);

      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
      expect(parser.parse).toHaveBeenCalledTimes(1);
    });

    it("should continue scanning when parsing a file fails", async () => {
      const parseError = new Error("Parsing failed");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      parser.parse
        .mockRejectedValueOnce(parseError)
        .mockResolvedValueOnce([]);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(parser.parse).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to scan Flask file: /project/app.py",
        parseError
      );
    });

    it("should skip non-array parser results", async () => {
      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      parser.parse.mockResolvedValue(null);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(blueprintResolver.resolve).toHaveBeenCalledWith(
        [],
        workspace
      );
    });

    it("should use discovered routes if the resolver returns a non-array", async () => {
      const routes = [
        {
          path: "/",
          methods: [ "GET" ],
          handler: "home"
        }
      ];

      fileSystem.readFile.mockResolvedValue(
        "from flask import Flask"
      );

      parser.parse.mockResolvedValue(routes);
      blueprintResolver.resolve.mockResolvedValue(null);

      const result = await scanner.scan(workspace);

      expect(result).toHaveLength(2);
      expect(result[ 0 ]).toMatchObject({
        path: "/",
        handler: "home"
      });
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

    it("should not destroy an injected blueprint resolver", () => {
      blueprintResolver.destroy = vi.fn();

      scanner.destroy();

      expect(blueprintResolver.destroy).not.toHaveBeenCalled();
    });

    it("should destroy an internally owned parser when supported", () => {
      const instance = new FlaskScanner({
        fileSystem,
        blueprintResolver
      });

      const ownedParser = instance.parser;
      const destroySpy = vi.spyOn(ownedParser, "destroy");

      instance.destroy();

      if (typeof ownedParser.destroy === "function") {
        expect(destroySpy).toHaveBeenCalledTimes(1);
      }
    });

    it("should destroy an internally owned blueprint resolver", () => {
      const instance = new FlaskScanner({
        fileSystem,
        parser
      });

      const ownedResolver = instance.blueprintResolver;
      const destroySpy = vi.spyOn(ownedResolver, "destroy");

      instance.destroy();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("should be safe to call more than once", () => {
      scanner.destroy();

      expect(() => scanner.destroy()).not.toThrow();
    });

    it("should clear its dependencies after destruction", () => {
      scanner.destroy();

      expect(scanner.parser).toBeNull();
      expect(scanner.blueprintResolver).toBeNull();
      expect(scanner.fileSystem).toBeNull();
    });

    it("should clear ownership flags after destruction", () => {
      scanner.destroy();

      expect(scanner.ownsParser).toBe(false);
      expect(scanner.ownsBlueprintResolver).toBe(false);
    });
  });
});
