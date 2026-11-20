import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import ExpressScanner from "../../../src/scanners/express/ExpressScanner.js";
import ExpressRouteParser from "../../../src/scanners/express/ExpressRouteParser.js";
import ExpressRouterResolver from "../../../src/scanners/express/ExpressRouterResolver.js";

describe("ExpressScanner", () => {
  let fileSystem;
  let parser;
  let routerResolver;
  let scanner;

  const workspace = {
    root: "/project",
    name: "test-project"
  };

  const supportedExtensions = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs"
  ];

  beforeEach(() => {
    fileSystem = {
      findFiles: vi.fn().mockResolvedValue([
        "/project/server.js",
        "/project/routes.js"
      ]),
      readFile: vi.fn()
    };

    parser = {
      parse: vi.fn().mockResolvedValue([])
    };

    routerResolver = {
      resolve: vi.fn(async routes => routes)
    };

    scanner = new ExpressScanner({
      fileSystem,
      parser,
      routerResolver
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
      expect(() => new ExpressScanner()).toThrow(
        "ExpressScanner requires a FileSystemAdapter."
      );
    });

    it("should initialize scanner metadata", () => {
      expect(scanner.id).toBe("express");
      expect(scanner.name).toBe("Express Scanner");
      expect(scanner.framework).toBe("express");
    });

    it("should support all configured JavaScript and TypeScript extensions", () => {
      expect(scanner.extensions).toEqual(
        supportedExtensions
      );
    });

    it("should use the provided parser", () => {
      expect(scanner.parser).toBe(parser);
    });

    it("should use the provided router resolver", () => {
      expect(scanner.routerResolver).toBe(routerResolver);
    });

    it("should pass the filesystem adapter to the default router resolver", () => {
      const defaultScanner = new ExpressScanner({
        fileSystem
      });

      expect(
        defaultScanner.routerResolver
      ).toBeInstanceOf(ExpressRouterResolver);

      expect(
        defaultScanner.routerResolver.fileSystem
      ).toBe(fileSystem);

      defaultScanner.destroy();
    });

    it("should create a default parser when none is provided", () => {
      const defaultScanner = new ExpressScanner({
        fileSystem
      });

      expect(
        defaultScanner.parser
      ).toBeInstanceOf(ExpressRouteParser);

      defaultScanner.destroy();
    });
  });

  describe("supportsExtension()", () => {
    it.each(supportedExtensions)(
      "should support %s files",
      extension => {
        expect(
          scanner.supportsExtension(`server${extension}`)
        ).toBe(true);
      }
    );

    it.each([
      ".py",
      ".php",
      ".json",
      ".html"
    ])(
      "should reject %s files",
      extension => {
        expect(
          scanner.supportsExtension(`server${extension}`)
        ).toBe(false);
      }
    );
  });

  describe("containsExpressReference()", () => {
    it("should detect ES module imports", () => {
      expect(
        scanner.containsExpressReference(
          'import express from "express";'
        )
      ).toBe(true);
    });

    it("should detect ES module imports using single quotes", () => {
      expect(
        scanner.containsExpressReference(
          "import express from 'express';"
        )
      ).toBe(true);
    });

    it("should detect CommonJS require statements", () => {
      expect(
        scanner.containsExpressReference(
          'const express = require("express");'
        )
      ).toBe(true);
    });

    it("should detect Express application instances", () => {
      expect(
        scanner.containsExpressReference(
          "const app = express();"
        )
      ).toBe(true);
    });

    it("should detect Express Router references", () => {
      expect(
        scanner.containsExpressReference(
          "const router = express.Router();"
        )
      ).toBe(true);
    });

    it("should reject unrelated JavaScript code", () => {
      expect(
        scanner.containsExpressReference(
          "function add(a, b) { return a + b; }"
        )
      ).toBe(false);
    });

    it("should reject empty content", () => {
      expect(
        scanner.containsExpressReference("")
      ).toBe(false);
    });
  });

  describe("detect()", () => {
    it("should detect an Express workspace", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          'const express = require("express");'
        )
        .mockResolvedValueOnce(
          "function handler() {}"
        );

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          extensions: supportedExtensions
        })
      );
    });

    it("should return false when no Express references are found", async () => {
      fileSystem.readFile.mockResolvedValue(
        "function add(a, b) { return a + b; }"
      );

      const result = await scanner.detect(workspace);

      expect(result).toBe(false);
    });

    it("should return false when no files are discovered", async () => {
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

    it("should stop after finding an Express reference", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          'const express = require("express");'
        )
        .mockResolvedValueOnce(
          'import express from "express";'
        );

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);
      expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
    });

    it("should exclude dependency and build directories", async () => {
      await scanner.detect(workspace);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          exclude: expect.arrayContaining([
            "node_modules",
            ".git",
            "dist",
            "build",
            "coverage"
          ])
        })
      );
    });

    it("should return false when the workspace has no root", async () => {
      const result = await scanner.detect({
        name: "invalid-workspace"
      });

      expect(result).toBe(false);
      expect(fileSystem.findFiles).not.toHaveBeenCalled();
    });

    it("should continue inspecting files when reading fails", async () => {
      const readError = new Error("Unable to read file");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.readFile
        .mockRejectedValueOnce(readError)
        .mockResolvedValueOnce(
          'import express from "express";'
        );

      const result = await scanner.detect(workspace);

      expect(result).toBe(true);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to inspect Express file: /project/server.js",
        readError
      );
    });

    it("should propagate file discovery errors", async () => {
      fileSystem.findFiles.mockRejectedValue(
        new Error("Discovery failed")
      );

      await expect(
        scanner.detect(workspace)
      ).rejects.toThrow("Discovery failed");
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

    it("should parse discovered JavaScript and TypeScript files", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(
          'const express = require("express");'
        )
        .mockResolvedValueOnce(
          'import express from "express";'
        );

      await scanner.scan(workspace);

      expect(parser.parse).toHaveBeenCalledTimes(2);

      expect(parser.parse).toHaveBeenCalledWith(
        'const express = require("express");',
        expect.objectContaining({
          file: "/project/server.js",
          workspace
        })
      );
    });

    it("should pass discovered routes through the router resolver", async () => {
      const parsedRoutes = [
        {
          path: "/users",
          methods: [ "GET" ],
          handler: "getUsers",
          file: "/project/server.js",
          line: 5
        }
      ];

      fileSystem.readFile.mockResolvedValue(
        'const express = require("express");'
      );

      parser.parse.mockResolvedValue(parsedRoutes);

      await scanner.scan(workspace);

      expect(routerResolver.resolve).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: "/users",
            methods: [ "GET" ],
            handler: "getUsers",
            file: "/project/server.js"
          })
        ]),
        workspace
      );
    });

    it("should return resolved routes", async () => {
      const resolvedRoutes = [
        {
          path: "/users",
          methods: [ "GET" ],
          handler: "getUsers",
          framework: "express"
        }
      ];

      fileSystem.readFile.mockResolvedValue(
        'const express = require("express");'
      );

      parser.parse.mockResolvedValue([
        {
          path: "/users",
          methods: [ "GET" ],
          handler: "getUsers",
          file: "/project/server.js",
          line: 5
        }
      ]);

      routerResolver.resolve.mockResolvedValue(
        resolvedRoutes
      );

      const result = await scanner.scan(workspace);

      expect(result).toEqual(resolvedRoutes);
    });

    it("should return an empty array when no routes are discovered", async () => {
      fileSystem.readFile.mockResolvedValue(
        'const express = require("express");'
      );

      parser.parse.mockResolvedValue([]);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
    });

    it("should pass custom exclusions to file discovery", async () => {
      fileSystem.readFile.mockResolvedValue(
        'const express = require("express");'
      );

      const options = {
        exclude: [ "generated", "temporary" ]
      };

      await scanner.scan(workspace, options);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          extensions: supportedExtensions,
          exclude: [ "generated", "temporary" ]
        })
      );
    });

    it("should use default exclusions when none are provided", async () => {
      fileSystem.readFile.mockResolvedValue(
        'const express = require("express");'
      );

      await scanner.scan(workspace);

      expect(fileSystem.findFiles).toHaveBeenCalledWith(
        workspace.root,
        expect.objectContaining({
          exclude: expect.arrayContaining([
            "node_modules",
            ".git",
            "dist",
            "build",
            "coverage"
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

    it("should return an empty array when file discovery returns a non-array", async () => {
      fileSystem.findFiles.mockResolvedValue(null);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(parser.parse).not.toHaveBeenCalled();
      expect(routerResolver.resolve).not.toHaveBeenCalled();
    });

    it("should continue scanning when a file cannot be read", async () => {
      const readError = new Error("Unable to read file");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.readFile
        .mockRejectedValueOnce(readError)
        .mockResolvedValueOnce(
          'import express from "express";'
        );

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(parser.parse).toHaveBeenCalledTimes(1);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to scan Express file: /project/server.js",
        readError
      );
    });

    it("should skip files whose content is not a string", async () => {
      fileSystem.readFile
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          'import express from "express";'
        );

      const result = await scanner.scan(workspace);

      expect(parser.parse).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });

    it("should continue scanning when parsing a file fails", async () => {
      const parseError = new Error("Parsing failed");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      fileSystem.readFile.mockResolvedValue(
        'import express from "express";'
      );

      parser.parse
        .mockRejectedValueOnce(parseError)
        .mockResolvedValueOnce([]);

      const result = await scanner.scan(workspace);

      expect(result).toEqual([]);
      expect(parser.parse).toHaveBeenCalledTimes(2);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to scan Express file: /project/server.js",
        parseError
      );
    });

    it("should use discovered routes if the resolver returns a non-array", async () => {
      const routes = [
        {
          path: "/users",
          methods: [ "GET" ],
          handler: "getUsers"
        }
      ];

      fileSystem.readFile.mockResolvedValue(
        'import express from "express";'
      );

      parser.parse.mockResolvedValue(routes);
      routerResolver.resolve.mockResolvedValue(null);

      const result = await scanner.scan(workspace);

      expect(result).toHaveLength(2);

      expect(result[ 0 ]).toMatchObject({
        path: "/users",
        handler: "getUsers"
      });
    });
  });

  describe("destroy()", () => {
    it("should mark the scanner as destroyed", () => {
      scanner.destroy();

      expect(scanner.destroyed).toBe(true);
    });

    it("should not destroy a caller-owned parser", () => {
      parser.destroy = vi.fn();

      scanner.destroy();

      expect(parser.destroy).not.toHaveBeenCalled();
    });

    it("should not destroy a caller-owned router resolver", () => {
      routerResolver.destroy = vi.fn();

      scanner.destroy();

      expect(routerResolver.destroy).not.toHaveBeenCalled();
    });

    it("should destroy an internally created parser", () => {
      const defaultScanner = new ExpressScanner({
        fileSystem
      });

      const destroySpy = vi.spyOn(
        defaultScanner.parser,
        "destroy"
      );

      defaultScanner.destroy();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("should destroy an internally created router resolver", () => {
      const defaultScanner = new ExpressScanner({
        fileSystem
      });

      const destroySpy = vi.spyOn(
        defaultScanner.routerResolver,
        "destroy"
      );

      defaultScanner.destroy();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("should clear dependencies after destruction", () => {
      scanner.destroy();

      expect(scanner.parser).toBeNull();
      expect(scanner.routerResolver).toBeNull();
      expect(scanner.fileSystem).toBeNull();
    });

    it("should be safe to call more than once", () => {
      scanner.destroy();

      expect(() => scanner.destroy()).not.toThrow();
    });
  });
});
