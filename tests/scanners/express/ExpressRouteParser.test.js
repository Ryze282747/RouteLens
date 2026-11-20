import { beforeEach, describe, expect, it } from "vitest";
import ExpressRouteParser from "../../../src/scanners/express/ExpressRouteParser.js";

describe("ExpressRouteParser", () => {
  let parser;

  beforeEach(() => {
    parser = new ExpressRouteParser();
  });

  describe("parse()", () => {
    it("should parse a GET route", async () => {
      const routes = await parser.parse(
        'app.get("/users", getUsers);'
      );

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/users");
      expect(routes[ 0 ].methods).toEqual([ "GET" ]);
      expect(routes[ 0 ].handler).toBe("getUsers");
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
          `app.${method}("/users", handler);`
        );

        expect(routes).toHaveLength(1);
        expect(routes[ 0 ].methods).toEqual([ method.toUpperCase() ]);
      }
    });

    it("should expand the ALL method", async () => {
      const routes = await parser.parse(
        'app.all("/users", handler);'
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

    it("should parse multiple direct routes", async () => {
      const routes = await parser.parse(`
        app.get("/users", getUsers);
        app.post("/users", createUser);
        app.delete("/users/:id", deleteUser);
      `);

      expect(routes).toHaveLength(3);
    });

    it("should preserve the router name", async () => {
      const routes = await parser.parse(
        'api.get("/users", handler);'
      );

      expect(routes[ 0 ].router).toBe("api");
    });

    it("should preserve the source file", async () => {
      const routes = await parser.parse(
        'app.get("/users", handler);',
        { file: "src/routes/users.js" }
      );

      expect(routes[ 0 ].file).toBe("src/routes/users.js");
    });

    it("should include line numbers", async () => {
      const routes = await parser.parse(`
        const app = express();

        app.get("/users", handler);
      `);

      expect(routes[ 0 ].line).toBe(4);
    });

    it("should include parser metadata", async () => {
      const routes = await parser.parse(
        'app.get("/users", handler);'
      );

      expect(routes[ 0 ].metadata.parser).toBe("express");
      expect(routes[ 0 ].metadata.declaration).toBe("app.get");
    });

    it("should include the source expression", async () => {
      const routes = await parser.parse(
        'app.get("/users", handler);'
      );

      expect(routes[ 0 ].source.type).toBe("method-call");
      expect(routes[ 0 ].source.expression).toContain('app.get("/users"');
    });

    it("should return an empty array for source without routes", async () => {
      const routes = await parser.parse(`
        const app = express();

        function getUsers() {
          return [];
        }
      `);

      expect(routes).toEqual([]);
    });

    it("should reject non-string source", async () => {
      await expect(parser.parse(null)).rejects.toThrow(
        "Source content must be a string."
      );
    });
  });

  describe("static path extraction", () => {
    it("should parse single-quoted paths", async () => {
      const routes = await parser.parse(
        "app.get('/users', handler);"
      );

      expect(routes[ 0 ].path).toBe("/users");
    });

    it("should parse double-quoted paths", async () => {
      const routes = await parser.parse(
        'app.get("/users", handler);'
      );

      expect(routes[ 0 ].path).toBe("/users");
    });

    it("should parse static template literal paths", async () => {
      const routes = await parser.parse(
        "app.get(`/users`, handler);"
      );

      expect(routes[ 0 ].path).toBe("/users");
    });

    it("should ignore dynamic template literal paths", async () => {
      const routes = await parser.parse(
        "app.get(`/users/${userId}`, handler);"
      );

      expect(routes).toEqual([]);
    });

    it("should ignore variable-based paths", async () => {
      const routes = await parser.parse(
        "app.get(userPath, handler);"
      );

      expect(routes).toEqual([]);
    });

    it("should ignore regular-expression paths", async () => {
      const routes = await parser.parse(
        "app.get(/^\\/users/, handler);"
      );

      expect(routes).toEqual([]);
    });

    it("should preserve escaped characters in paths", async () => {
      const routes = await parser.parse(
        String.raw`app.get("/users\/active", handler);`
      );

      expect(routes[ 0 ].path).toBe("/users\\/active");
    });
  });

  describe("route chains", () => {
    it("should parse a basic route chain", async () => {
      const routes = await parser.parse(`
        app.route("/users")
          .get(getUsers)
          .post(createUser);
      `);

      expect(routes).toHaveLength(2);
      expect(routes.map((route) => route.methods[ 0 ])).toEqual([
        "GET",
        "POST"
      ]);
    });

    it("should parse a multiline route chain", async () => {
      const routes = await parser.parse(
        [
          'app.route("/users")',
          "  .get(getUsers)",
          "  .post(createUser);"
        ].join("\n")
      );

      expect(routes).toHaveLength(2);
    });

    it("should parse all supported chain methods", async () => {
      const routes = await parser.parse(`
        app.route("/users")
          .get(getUsers)
          .post(createUser)
          .put(updateUser)
          .patch(patchUser)
          .delete(deleteUser)
          .options(optionsHandler)
          .head(headHandler);
      `);

      expect(routes).toHaveLength(7);
    });

    it("should expand ALL in a route chain", async () => {
      const routes = await parser.parse(`
        app.route("/users")
          .all(handler);
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].methods).toContain("GET");
      expect(routes[ 0 ].methods).toContain("DELETE");
    });

    it("should preserve the route path for every chain method", async () => {
      const routes = await parser.parse(`
        app.route("/users")
          .get(getUsers)
          .post(createUser);
      `);

      expect(routes.every((route) => route.path === "/users")).toBe(true);
    });

    it("should identify chain declarations in metadata", async () => {
      const routes = await parser.parse(`
        app.route("/users")
          .get(getUsers);
      `);

      expect(routes[ 0 ].source.type).toBe("route-chain");
      expect(routes[ 0 ].metadata.declaration).toBe("route().get");
    });
  });

  describe("comments and false positives", () => {
    it("should ignore routes inside line comments", async () => {
      const routes = await parser.parse(`
        // app.get("/fake", handler);
        app.get("/real", handler);
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/real");
    });

    it("should ignore routes inside block comments", async () => {
      const routes = await parser.parse(`
        /*
          app.get("/fake", handler);
        */
        app.get("/real", handler);
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/real");
    });

    it("should ignore route-like text inside strings", async () => {
      const routes = await parser.parse(`
        const example = 'app.get("/fake", handler)';
        app.get("/real", handler);
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/real");
    });

    it("should ignore route-like text inside template literals", async () => {
      const routes = await parser.parse(`
        const example = \`app.get("/fake", handler)\`;
        app.get("/real", handler);
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/real");
    });

    it("should not mistake nested callback methods for route chains", async () => {
      const routes = await parser.parse(`
        app.route("/users")
          .get((req, res) => {
            something.post("/not-a-route", handler);
          });
      `);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].methods).toEqual([ "GET" ]);
    });

    it("should ignore incomplete route declarations", async () => {
      const routes = await parser.parse(
        'app.get("/users", handler'
      );

      expect(routes).toEqual([]);
    });
  });

  describe("argument parsing", () => {
    it("should extract a simple handler", async () => {
      const routes = await parser.parse(
        'app.get("/users", getUsers);'
      );

      expect(routes[ 0 ].handler).toBe("getUsers");
    });

    it("should extract a dotted handler", async () => {
      const routes = await parser.parse(
        'app.get("/users", controllers.getUsers);'
      );

      expect(routes[ 0 ].handler).toBe("controllers.getUsers");
    });

    it("should extract the last handler after middleware", async () => {
      const routes = await parser.parse(
        'app.get("/users", authenticate, getUsers);'
      );

      expect(routes[ 0 ].handler).toBe("getUsers");
    });

    it("should not treat an inline callback as a named handler", async () => {
      const routes = await parser.parse(
        'app.get("/users", (req, res) => res.json([]));'
      );

      expect(routes[ 0 ].handler).toBeNull();
    });

    it("should handle nested arguments", async () => {
      const routes = await parser.parse(
        'app.get("/users", wrap(authenticate, getUsers));'
      );

      expect(routes[ 0 ].handler).toBeNull();
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
        parser.parse('app.get("/users", handler);')
      ).rejects.toThrow("ExpressRouteParser has been destroyed.");
    });
  });
});
