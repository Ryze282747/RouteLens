import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import SourceLocator from "../../src/navigation/SourceLocator.js";

describe("SourceLocator", () => {
  let locator;
  let fileSystem;

  const createRoute = (overrides = {}) => ({
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    file: "routes/users.js",
    line: 10,
    handler: "getUsers",
    ...overrides
  });

  beforeEach(() => {
    fileSystem = {
      readFile: vi.fn()
    };

    locator = new SourceLocator({
      fileSystem
    });
  });

  afterEach(() => {
    if (locator && !locator.destroyed) {
      locator.destroy();
    }

    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize without being destroyed", () => {
      expect(locator.destroyed).toBe(false);
    });

    it("should store the provided filesystem", () => {
      expect(locator.fileSystem).toBe(fileSystem);
    });

    it("should accept no options", () => {
      const instance = new SourceLocator();

      expect(instance.fileSystem).toBeNull();
      expect(instance.destroyed).toBe(false);

      instance.destroy();
    });

    it("should accept a null filesystem", () => {
      const instance = new SourceLocator({
        fileSystem: null
      });

      expect(instance.fileSystem).toBeNull();

      instance.destroy();
    });
  });

  describe("locate()", () => {
    it("should return the route source location", () => {
      expect(locator.locate(createRoute())).toEqual({
        file: "routes/users.js",
        line: 10,
        handler: "getUsers",
        type: "route"
      });
    });

    it("should preserve the route file", () => {
      const result = locator.locate(
        createRoute({
          file: "app/api/users.py"
        })
      );

      expect(result.file).toBe("app/api/users.py");
    });

    it("should preserve a valid positive line number", () => {
      const result = locator.locate(
        createRoute({
          line: 25
        })
      );

      expect(result.line).toBe(25);
    });

    it.each([
      0,
      -1,
      1.5,
      "10",
      null,
      undefined,
      NaN
    ])("should normalize invalid line numbers to null (%s)", (line) => {
      const result = locator.locate(
        createRoute({
          line
        })
      );

      expect(result.line).toBeNull();
    });

    it("should use null when the handler is missing", () => {
      const result = locator.locate(
        createRoute({
          handler: undefined
        })
      );

      expect(result.handler).toBeNull();
    });

    it("should use null when the handler is empty", () => {
      const result = locator.locate(
        createRoute({
          handler: ""
        })
      );

      expect(result.handler).toBeNull();
    });

    it("should preserve a valid handler", () => {
      const result = locator.locate(
        createRoute({
          handler: "UserController.index"
        })
      );

      expect(result.handler).toBe("UserController.index");
    });

    it("should return route as the location type", () => {
      expect(locator.locate(createRoute()).type).toBe("route");
    });

    it.each([
      null,
      undefined,
      {},
      [],
      "invalid",
      {
        line: 10
      },
      {
        file: ""
      },
      {
        file: "   "
      },
      {
        file: null
      },
      {
        file: 123
      }
    ])("should reject an invalid route (%s)", (route) => {
      expect(() => locator.locate(route)).toThrow(
        "A valid route with a source file is required."
      );
    });

    it("should not read the filesystem", () => {
      locator.locate(createRoute());

      expect(fileSystem.readFile).not.toHaveBeenCalled();
    });
  });

  describe("locateHandler()", () => {
    it("should locate a Python function", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "from flask import Flask",
          "",
          "def getUsers():",
          "    return []"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result).toEqual({
        file: "routes/users.js",
        line: 3,
        handler: "getUsers",
        type: "handler"
      });
    });

    it("should locate an asynchronous Python function", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "import asyncio",
          "",
          "async def getUsers():",
          "    return []"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(3);
    });

    it("should locate a JavaScript function declaration", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "import express from 'express';",
          "",
          "export function getUsers() {",
          "  return [];",
          "}"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(3);
    });

    it("should locate an asynchronous JavaScript function", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "const value = 1;",
          "",
          "export async function getUsers() {",
          "  return [];",
          "}"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(3);
    });

    it("should locate a const arrow-function declaration", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "import express from 'express';",
          "",
          "const getUsers = async (req, res) => {",
          "  res.json([]);",
          "};"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(3);
    });

    it("should locate a let function declaration", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "const value = 1;",
          "let getUsers = function() {}; "
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(2);
    });

    it("should locate a var function declaration", async () => {
      fileSystem.readFile.mockResolvedValue(
        "var getUsers = () => [];"
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(1);
    });

    it("should locate a PHP-style function declaration", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "<?php",
          "",
          "class UserController {",
          "    public function getUsers() {",
          "        return [];",
          "    }",
          "}"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "UserController@getUsers"
        })
      );

      expect(result).toEqual({
        file: "routes/users.js",
        line: 4,
        handler: "UserController@getUsers",
        type: "handler"
      });
    });

    it("should locate a protected PHP-style function", async () => {
      fileSystem.readFile.mockResolvedValue(
        "    protected function getUsers() {}"
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(1);
    });

    it("should locate a private static PHP-style function", async () => {
      fileSystem.readFile.mockResolvedValue(
        "    private static function getUsers() {}"
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(1);
    });

    it("should locate an indented function declaration", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "class UserController:",
          "    def getUsers(self):",
          "        return []"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result.line).toBe(2);
    });

    it("should extract the final handler name from a dotted handler", async () => {
      fileSystem.readFile.mockResolvedValue(
        "function getUsers() {}"
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "UserController.getUsers"
        })
      );

      expect(result.line).toBe(1);
      expect(result.handler).toBe("UserController.getUsers");
    });

    it("should extract the final handler name from an at-sign handler", async () => {
      fileSystem.readFile.mockResolvedValue(
        "function getUsers() {}"
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "UserController@getUsers"
        })
      );

      expect(result.line).toBe(1);
    });

    it("should escape regular-expression characters in handler names", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "function getUsers() {}",
          "function getUsersX() {}"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers+"
        })
      );

      expect(result).toBeNull();
    });

    it("should return null when no handler declaration is found", async () => {
      fileSystem.readFile.mockResolvedValue(
        [
          "const value = 10;",
          "function anotherHandler() {}"
        ].join("\n")
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "getUsers"
        })
      );

      expect(result).toBeNull();
    });

    it("should return null when the handler is missing", async () => {
      const result = await locator.locateHandler(
        createRoute({
          handler: null
        })
      );

      expect(result).toBeNull();
      expect(fileSystem.readFile).not.toHaveBeenCalled();
    });

    it("should return null when the handler is an empty string", async () => {
      const result = await locator.locateHandler(
        createRoute({
          handler: ""
        })
      );

      expect(result).toBeNull();
      expect(fileSystem.readFile).not.toHaveBeenCalled();
    });

    it("should return null when no filesystem is provided", async () => {
      const instance = new SourceLocator();

      const result = await instance.locateHandler(
        createRoute()
      );

      expect(result).toBeNull();

      instance.destroy();
    });

    it("should return null when the filesystem has no readFile method", async () => {
      const instance = new SourceLocator({
        fileSystem: {}
      });

      const result = await instance.locateHandler(
        createRoute()
      );

      expect(result).toBeNull();

      instance.destroy();
    });

    it("should return null when the filesystem returns a non-string value", async () => {
      fileSystem.readFile.mockResolvedValue({
        content: "function getUsers() {}"
      });

      const result = await locator.locateHandler(
        createRoute()
      );

      expect(result).toBeNull();
    });

    it("should return null when the filesystem returns null", async () => {
      fileSystem.readFile.mockResolvedValue(null);

      const result = await locator.locateHandler(
        createRoute()
      );

      expect(result).toBeNull();
    });

    it("should read the route source file", async () => {
      fileSystem.readFile.mockResolvedValue(
        "function getUsers() {}"
      );

      await locator.locateHandler(
        createRoute({
          file: "src/controllers/users.js"
        })
      );

      expect(fileSystem.readFile).toHaveBeenCalledWith(
        "src/controllers/users.js"
      );
    });

    it("should return null when reading the file fails", async () => {
      const error = new Error("File read failed.");

      fileSystem.readFile.mockRejectedValue(error);

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      const result = await locator.locateHandler(
        createRoute()
      );

      expect(result).toBeNull();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Failed to locate handler in routes/users.js:",
        error
      );
    });

    it("should return the original route file in the result", async () => {
      fileSystem.readFile.mockResolvedValue(
        "function getUsers() {}"
      );

      const result = await locator.locateHandler(
        createRoute({
          file: "backend/controllers/users.js"
        })
      );

      expect(result.file).toBe(
        "backend/controllers/users.js"
      );
    });

    it("should return the original handler name in the result", async () => {
      fileSystem.readFile.mockResolvedValue(
        "function getUsers() {}"
      );

      const result = await locator.locateHandler(
        createRoute({
          handler: "UserController.getUsers"
        })
      );

      expect(result.handler).toBe(
        "UserController.getUsers"
      );
    });

    it("should return handler as the location type", async () => {
      fileSystem.readFile.mockResolvedValue(
        "function getUsers() {}"
      );

      const result = await locator.locateHandler(
        createRoute()
      );

      expect(result.type).toBe("handler");
    });
  });

  describe("findHandlerLine()", () => {
    it("should return null for non-string content", () => {
      expect(
        locator.findHandlerLine(null, "getUsers")
      ).toBeNull();
    });

    it("should return null for a non-string handler", () => {
      expect(
        locator.findHandlerLine(
          "function getUsers() {}",
          null
        )
      ).toBeNull();
    });

    it("should return null for an empty handler", () => {
      expect(
        locator.findHandlerLine(
          "function getUsers() {}",
          "   "
        )
      ).toBeNull();
    });

    it("should return the first matching declaration", () => {
      const content = [
        "function getUsers() {}",
        "",
        "function getUsers() {}"
      ].join("\n");

      expect(
        locator.findHandlerLine(content, "getUsers")
      ).toBe(1);
    });

    it("should not match a handler name embedded in another identifier", () => {
      const content = [
        "function getUsersExtended() {}",
        "function anotherHandler() {}"
      ].join("\n");

      expect(
        locator.findHandlerLine(content, "getUsers")
      ).toBeNull();
    });

    it("should handle special regular-expression characters", () => {
      const content = [
        "function getUsers() {}",
        "const getUsersX = () => {};"
      ].join("\n");

      expect(
        locator.findHandlerLine(content, "getUsers+")
      ).toBeNull();
    });
  });

  describe("getLineNumber()", () => {
    it("should return line 1 for the beginning of a file", () => {
      expect(
        locator.getLineNumber("function getUsers() {}", 0)
      ).toBe(1);
    });

    it("should count preceding newline characters", () => {
      const content = [
        "line one",
        "line two",
        "line three"
      ].join("\n");

      const index = content.indexOf("line three");

      expect(
        locator.getLineNumber(content, index)
      ).toBe(3);
    });

    it("should handle empty content", () => {
      expect(
        locator.getLineNumber("", 0)
      ).toBe(1);
    });
  });

  describe("normalizeLine()", () => {
    it("should preserve positive integers", () => {
      expect(locator.normalizeLine(15)).toBe(15);
    });

    it.each([
      0,
      -1,
      2.5,
      "15",
      null,
      undefined,
      NaN
    ])("should return null for invalid lines (%s)", (line) => {
      expect(locator.normalizeLine(line)).toBeNull();
    });
  });

  describe("validateRoute()", () => {
    it("should accept a valid route", () => {
      expect(() =>
        locator.validateRoute(createRoute())
      ).not.toThrow();
    });

    it.each([
      null,
      undefined,
      [],
      "invalid",
      {},
      {
        file: ""
      },
      {
        file: "   "
      },
      {
        file: null
      },
      {
        file: 123
      }
    ])("should reject invalid routes (%s)", (route) => {
      expect(() =>
        locator.validateRoute(route)
      ).toThrow(
        "A valid route with a source file is required."
      );
    });
  });

  describe("lifecycle", () => {
    it("should mark the locator as destroyed", () => {
      locator.destroy();

      expect(locator.destroyed).toBe(true);
    });

    it("should clear the filesystem reference on destruction", () => {
      locator.destroy();

      expect(locator.fileSystem).toBeNull();
    });

    it("should allow destroy() to be called more than once", () => {
      locator.destroy();

      expect(() => locator.destroy()).not.toThrow();
    });

    it("should throw when locate() is called after destruction", () => {
      locator.destroy();

      expect(() =>
        locator.locate(createRoute())
      ).toThrow(
        "SourceLocator has been destroyed."
      );
    });

    it("should throw when locateHandler() is called after destruction", async () => {
      locator.destroy();

      await expect(
        locator.locateHandler(createRoute())
      ).rejects.toThrow(
        "SourceLocator has been destroyed."
      );
    });

    it("should throw when findHandlerLine() is called after destruction only if indirectly guarded", () => {
      expect(() =>
        locator.findHandlerLine(
          "function getUsers() {}",
          "getUsers"
        )
      ).not.toThrow();
    });

    it("should throw when ensureActive() is called after destruction", () => {
      locator.destroy();

      expect(() =>
        locator.ensureActive()
      ).toThrow(
        "SourceLocator has been destroyed."
      );
    });
  });
});
