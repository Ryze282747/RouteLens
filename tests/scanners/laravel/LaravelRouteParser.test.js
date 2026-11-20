import { beforeEach, describe, expect, it } from "vitest";
import LaravelRouteParser from "../../../src/scanners/laravel/LaravelRouteParser.js";

describe("LaravelRouteParser", () => {
  let parser;

  beforeEach(() => {
    parser = new LaravelRouteParser();
  });

  describe("parse()", () => {
    it("should parse a GET route", async () => {
      const routes = await parser.parse(
        `Route::get('/users', [UserController::class, 'index']);`
      );

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/users");
      expect(routes[ 0 ].methods).toEqual([ "GET" ]);
    });

    it("should parse supported HTTP methods", async () => {
      const methods = [
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "options",
        "head"
      ];

      for (const method of methods) {
        const routes = await parser.parse(
          `Route::${method}('/users', 'UserController@index');`
        );

        expect(routes).toHaveLength(1);
        expect(routes[ 0 ].methods).toEqual([ method.toUpperCase() ]);
      }
    });

    it("should parse multiple route declarations", async () => {
      const routes = await parser.parse(`
        Route::get('/users', 'UserController@index');
        Route::post('/users', 'UserController@store');
        Route::delete('/users/{id}', 'UserController@destroy');
      `);

      expect(routes).toHaveLength(3);
    });

    it("should parse Route::any()", async () => {
      const routes = await parser.parse(
        `Route::any('/users', 'UserController@index');`
      );

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].methods).toEqual([
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
        "HEAD"
      ]);
    });

    it("should preserve the source file", async () => {
      const routes = await parser.parse(
        `Route::get('/users', 'UserController@index');`,
        { file: "routes/api.php" }
      );

      expect(routes[ 0 ].file).toBe("routes/api.php");
    });

    it("should include the correct line number", async () => {
      const routes = await parser.parse(`
        <?php

        Route::get('/users', 'UserController@index');
      `);

      expect(routes[ 0 ].line).toBe(4);
    });

    it("should include parser metadata", async () => {
      const routes = await parser.parse(
        `Route::get('/users', 'UserController@index');`
      );

      expect(routes[ 0 ].metadata.parser).toBe("laravel");
      expect(routes[ 0 ].metadata.declaration).toBe("Route::get");
    });

    it("should include source expression", async () => {
      const routes = await parser.parse(
        `Route::get('/users', 'UserController@index');`
      );

      expect(routes[ 0 ].source.type).toBe("facade-call");
      expect(routes[ 0 ].source.expression).toContain("Route::get");
    });

    it("should return an empty array when no routes exist", async () => {
      const routes = await parser.parse(`
        <?php

        class UserController {
          public function index() {
            return [];
          }
        }
      `);

      expect(routes).toEqual([]);
    });

    it("should reject non-string source", async () => {
      await expect(parser.parse(null)).rejects.toThrow(
        "PHP source content must be a string."
      );
    });
  });

  describe("Route::match()", () => {
    it("should parse multiple HTTP methods", async () => {
      const routes = await parser.parse(`
        Route::match(
          ['get', 'post'],
          '/users',
          'UserController@index'
        );
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].methods).toEqual([ "GET", "POST" ]);
      expect(routes[ 0 ].path).toBe("/users");
    });

    it("should normalize method casing", async () => {
      const routes = await parser.parse(
        `Route::match(['GET', 'Post'], '/users', 'UserController@index');`
      );

      expect(routes[ 0 ].methods).toEqual([ "GET", "POST" ]);
    });

    it("should remove duplicate methods", async () => {
      const routes = await parser.parse(
        `Route::match(['get', 'GET', 'post'], '/users', 'handler');`
      );

      expect(routes[ 0 ].methods).toEqual([ "GET", "POST" ]);
    });

    it("should ignore unsupported methods", async () => {
      const routes = await parser.parse(
        `Route::match(['get', 'trace'], '/users', 'handler');`
      );

      expect(routes[ 0 ].methods).toEqual([ "GET" ]);
    });

    it("should ignore match declarations without valid methods", async () => {
      const routes = await parser.parse(
        `Route::match(['trace'], '/users', 'handler');`
      );

      expect(routes).toEqual([]);
    });

    it("should ignore match declarations with missing arguments", async () => {
      const routes = await parser.parse(
        `Route::match(['get']);`
      );

      expect(routes).toEqual([]);
    });
  });

  describe("resource routes", () => {
    it("should parse Route::resource()", async () => {
      const routes = await parser.parse(
        `Route::resource('users', UserController::class);`
      );

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("users");
      expect(routes[ 0 ].metadata.resource).toBe(true);
      expect(routes[ 0 ].metadata.apiResource).toBe(false);
      expect(routes[ 0 ].metadata.resourceType).toBe("resource");
    });

    it("should parse Route::apiResource()", async () => {
      const routes = await parser.parse(
        `Route::apiResource('users', UserController::class);`
      );

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("users");
      expect(routes[ 0 ].metadata.resource).toBe(true);
      expect(routes[ 0 ].metadata.apiResource).toBe(true);
      expect(routes[ 0 ].metadata.resourceType).toBe("apiResource");
    });

    it("should extract resource controller handlers", async () => {
      const routes = await parser.parse(
        `Route::resource('users', UserController::class);`
      );

      expect(routes[ 0 ].handler).toBe("UserController");
    });

    it("should use resource HTTP methods", async () => {
      const routes = await parser.parse(
        `Route::resource('users', UserController::class);`
      );

      expect(routes[ 0 ].methods).toEqual([
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE"
      ]);
    });

    it("should ignore resource declarations with dynamic paths", async () => {
      const routes = await parser.parse(
        `Route::resource($resource, UserController::class);`
      );

      expect(routes).toEqual([]);
    });
  });

  describe("handler extraction", () => {
    it("should extract array controller syntax", async () => {
      const routes = await parser.parse(
        `Route::get('/users', [UserController::class, 'index']);`
      );

      expect(routes[ 0 ].handler).toBe("UserController@index");
    });

    it("should extract namespaced controller syntax", async () => {
      const routes = await parser.parse(
        `Route::get('/users', [App\\Http\\Controllers\\UserController::class, 'index']);`
      );

      expect(routes[ 0 ].handler).toBe(
        "App\\Http\\Controllers\\UserController@index"
      );
    });

    it("should extract string controller syntax", async () => {
      const routes = await parser.parse(
        `Route::get('/users', 'UserController@index');`
      );

      expect(routes[ 0 ].handler).toBe("UserController@index");
    });

    it("should extract invokable controller syntax", async () => {
      const routes = await parser.parse(
        `Route::get('/users', UserController::class);`
      );

      expect(routes[ 0 ].handler).toBe("UserController");
    });

    it("should return null for closure handlers", async () => {
      const routes = await parser.parse(`
        Route::get('/users', function () {
          return [];
        });
      `);

      expect(routes[ 0 ].handler).toBeNull();
    });
  });

  describe("argument parsing", () => {
    it("should handle nested function arguments", async () => {
      const routes = await parser.parse(`
        Route::get(
          '/users',
          middleware([UserController::class, 'index'])
        );
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/users");
    });

    it("should handle commas inside strings", async () => {
      const routes = await parser.parse(
        `Route::get('/users,active', 'UserController@index');`
      );

      expect(routes[ 0 ].path).toBe("/users,active");
    });

    it("should handle comments inside declarations", async () => {
      const routes = await parser.parse(`
        Route::get(
          // Route path
          '/users',
          /* Controller */
          'UserController@index'
        );
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/users");
    });

    it("should handle hash comments inside declarations", async () => {
      const routes = await parser.parse(`
        Route::get(
          '/users',
          # Controller handler
          'UserController@index'
        );
      `);

      expect(routes).toHaveLength(1);
    });

    it("should handle escaped quote characters", async () => {
      const routes = await parser.parse(
        String.raw`Route::get('/users\'active', 'UserController@index');`
      );

      expect(routes).toHaveLength(1);
    });
  });

  describe("comments and false positives", () => {
    it("should ignore route declarations in line comments", async () => {
      const routes = await parser.parse(`
        // Route::get('/fake', 'FakeController@index');
        Route::get('/real', 'RealController@index');
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/real");
    });

    it("should ignore route declarations in block comments", async () => {
      const routes = await parser.parse(`
        /*
          Route::get('/fake', 'FakeController@index');
        */
        Route::get('/real', 'RealController@index');
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/real");
    });

    it("should ignore route-like text inside PHP strings", async () => {
      const routes = await parser.parse(`
        $example = "Route::get('/fake', 'FakeController@index');";
        Route::get('/real', 'RealController@index');
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/real");
    });

    it("should ignore route-like text inside single-quoted strings", async () => {
      const routes = await parser.parse(`
        $example = 'Route::get("/fake", "FakeController@index");';
        Route::get('/real', 'RealController@index');
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/real");
    });

    it("should ignore incomplete declarations", async () => {
      const routes = await parser.parse(
        `Route::get('/users', 'UserController@index'`
      );

      expect(routes).toEqual([]);
    });
  });

  describe("lifecycle", () => {
    it("should be active initially", () => {
      expect(parser.destroyed).toBe(false);
    });

    it("should destroy the parser", () => {
      parser.destroy();

      expect(parser.destroyed).toBe(true);
      expect(parser.httpMethods.size).toBe(0);
    });

    it("should safely destroy more than once", () => {
      parser.destroy();

      expect(() => parser.destroy()).not.toThrow();
    });

    it("should reject parsing after destruction", async () => {
      parser.destroy();

      await expect(
        parser.parse(`Route::get('/users', 'UserController@index');`)
      ).rejects.toThrow("LaravelRouteParser has been destroyed.");
    });
  });
});
