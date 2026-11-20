import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FlaskRouteParser from "../../../src/scanners/flask/FlaskRouteParser.js";

describe("FlaskRouteParser", () => {
  let parser;

  beforeEach(() => {
    parser = new FlaskRouteParser();
  });

  afterEach(() => {
    if (!parser.destroyed) {
      parser.destroy();
    }
  });

  describe("parse()", () => {
    it("should parse a basic Flask route", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def get_users():
    return "users"
`, { file: "app.py" });

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ]).toMatchObject({
        path: "/users",
        methods: [ "GET" ],
        handler: "get_users",
        blueprint: "app",
        file: "app.py",
        line: 2
      });
    });

    it("should parse multiple routes", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def users():
    pass

@app.route("/posts")
def posts():
    pass
`);

      expect(routes).toHaveLength(2);
      expect(routes.map(route => route.path)).toEqual([
        "/users",
        "/posts"
      ]);
    });

    it("should parse asynchronous handlers", async () => {
      const routes = await parser.parse(`
@app.route("/users")
async def get_users():
    return []
`);

      expect(routes[ 0 ].handler).toBe("get_users");
      expect(routes[ 0 ].metadata.isAsync).toBe(true);
    });

    it("should preserve route source metadata", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def users():
    pass
`);

      expect(routes[ 0 ].source).toMatchObject({
        type: "decorator"
      });

      expect(routes[ 0 ].source.expression).toContain(
        '@app.route("/users")'
      );

      expect(routes[ 0 ].metadata.parser).toBe("flask");
      expect(routes[ 0 ].metadata.routeMethod).toBe("route");
    });

    it("should return an empty array when no routes exist", async () => {
      const routes = await parser.parse(`
def hello():
    return "hello"
`);

      expect(routes).toEqual([]);
    });

    it("should reject non-string source content", async () => {
      await expect(parser.parse(null)).rejects.toThrow(
        "Python source content must be a string."
      );

      await expect(parser.parse({})).rejects.toThrow(TypeError);
    });

    it("should support missing context", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def users():
    pass
`);

      expect(routes[ 0 ].file).toBeNull();
    });

    it("should use null when the context file is missing", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def users():
    pass
`, {});

      expect(routes[ 0 ].file).toBeNull();
    });
  });

  describe("HTTP method decorators", () => {
    it.each([
      [ "get", "GET" ],
      [ "post", "POST" ],
      [ "put", "PUT" ],
      [ "patch", "PATCH" ],
      [ "delete", "DELETE" ],
      [ "options", "OPTIONS" ],
      [ "head", "HEAD" ]
    ])("should parse the @app.%s decorator", async (decorator, method) => {
      const routes = await parser.parse(`
@app.${decorator}("/users")
def handler():
    pass
`);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].methods).toEqual([ method ]);
      expect(routes[ 0 ].metadata.routeMethod).toBe(decorator);
    });

    it("should parse multiple methods from a list", async () => {
      const routes = await parser.parse(`
@app.route("/users", methods=["GET", "POST"])
def users():
    pass
`);

      expect(routes[ 0 ].methods).toEqual([ "GET", "POST" ]);
    });

    it("should remove duplicate methods", async () => {
      const routes = await parser.parse(`
@app.route("/users", methods=["GET", "POST", "GET"])
def users():
    pass
`);

      expect(routes[ 0 ].methods).toEqual([ "GET", "POST" ]);
    });

    it("should normalize method casing and whitespace", async () => {
      const routes = await parser.parse(`
@app.route("/users", methods=[" get ", "post"])
def users():
    pass
`);

      expect(routes[ 0 ].methods).toEqual([ "GET", "POST" ]);
    });

    it("should default to GET when methods are omitted", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def users():
    pass
`);

      expect(routes[ 0 ].methods).toEqual([ "GET" ]);
    });

    it("should parse methods when other keyword arguments are present", async () => {
      const routes = await parser.parse(`
@app.route(
    "/users",
    defaults={"page": 1},
    methods=["GET", "POST"],
    strict_slashes=False
)
def users():
    pass
`);

      expect(routes[ 0 ].methods).toEqual([ "GET", "POST" ]);
    });
  });

  describe("route path extraction", () => {
    it("should parse single-quoted paths", async () => {
      const routes = await parser.parse(`
@app.route('/users')
def users():
    pass
`);

      expect(routes[ 0 ].path).toBe("/users");
    });

    it("should parse raw string paths", async () => {
      const routes = await parser.parse(String.raw`
@app.route(r"/users/<int:user_id>")
def users():
    pass
`);

      expect(routes[ 0 ].path).toBe("/users/<int:user_id>");
    });

    it("should parse paths containing parentheses", async () => {
      const routes = await parser.parse(`
@app.route("/users/(active)")
def users():
    pass
`);

      expect(routes[ 0 ].path).toBe("/users/(active)");
    });

    it("should parse paths containing escaped quotes", async () => {
      const routes = await parser.parse(String.raw`
@app.route("/users/\\"active\\"")
def users():
    pass
`);

      expect(routes).toHaveLength(1);
    });

    it("should ignore routes without a static string path", async () => {
      const routes = await parser.parse(`
@app.route(path_variable)
def users():
    pass
`);

      expect(routes).toEqual([]);
    });

    it("should not treat an f-string path as a static route", async () => {
      const routes = await parser.parse(`
@app.route(f"/users/{user_id}")
def users():
    pass
`);

      expect(routes).toEqual([]);
    });
  });

  describe("decorator argument parsing", () => {
    it("should handle nested parentheses", async () => {
      const routes = await parser.parse(`
@app.route(
    build_path("/users", include_version=True)
)
def users():
    pass
`);

      expect(routes).toEqual([]);
    });

    it("should handle closing parentheses inside strings", async () => {
      const routes = await parser.parse(`
@app.route("/users)")
def users():
    pass

@app.route("/posts")
def posts():
    pass
`);

      expect(routes).toHaveLength(2);
      expect(routes.map(route => route.path)).toEqual([
        "/users)",
        "/posts"
      ]);
    });

    it("should handle parentheses inside nested strings", async () => {
      const routes = await parser.parse(`
@app.route(
    "/users",
    defaults={"expression": "call(value)"}
)
def users():
    pass
`);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].path).toBe("/users");
    });

    it("should handle comments containing closing parentheses", async () => {
      const routes = await parser.parse(`
@app.route(
    "/users",
    # This comment contains )
    methods=["GET", "POST"]
)
def users():
    pass
`);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].methods).toEqual([ "GET", "POST" ]);
    });

    it("should not recognize decorator-like text inside a multiline string", async () => {
      const routes = await parser.parse(`
description = """
@app.route("/fake")
def fake():
    pass
"""

@app.route("/real")
def real():
    pass
`);

      expect(routes.map(route => route.path)).toEqual([ "/real" ]);
    });
  });

  describe("handler detection", () => {
    it("should associate a route with its following function", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def get_users():
    return []
`);

      expect(routes[ 0 ].handler).toBe("get_users");
    });

    it("should support decorated handlers", async () => {
      const routes = await parser.parse(`
@app.route("/users")
@login_required
@cache.cached()
def get_users():
    return []
`);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].handler).toBe("get_users");
    });

    it("should ignore a route without a following handler", async () => {
      const routes = await parser.parse(`
@app.route("/users")
`);

      expect(routes).toEqual([]);
    });

    it("should ignore a route when a new function appears before its handler", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def unrelated():
    pass
`);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].handler).toBe("unrelated");
    });

    it("should not associate a route with a function after an intervening class", async () => {
      const routes = await parser.parse(`
@app.route("/users")

class UserService:
    pass

def get_users():
    pass
`);

      expect(routes).toEqual([]);
    });
  });

  describe("blueprint references", () => {
    it("should extract a simple blueprint reference", async () => {
      const routes = await parser.parse(`
users_bp.route("/users")
def users():
    pass
`);

      // The parser only recognizes attribute route decorators.
      expect(routes).toEqual([]);
    });

    it("should extract the final identifier from a dotted route object", async () => {
      const routes = await parser.parse(`
@api.users.route("/users")
def users():
    pass
`);

      expect(routes).toHaveLength(1);
      expect(routes[ 0 ].blueprint).toBe("users");
    });

    it("should preserve the route object expression", async () => {
      const routes = await parser.parse(`
@api.users.route("/users")
def users():
    pass
`);

      expect(routes[ 0 ].source.expression).toContain(
        "api.users.route"
      );
    });
  });

  describe("line numbers", () => {
    it("should report the correct decorator line", async () => {
      const routes = await parser.parse(`
# First line

@app.route("/users")
def users():
    pass
`);

      expect(routes[ 0 ].line).toBe(4);
    });

    it("should report correct line numbers for multiple routes", async () => {
      const routes = await parser.parse(`
@app.route("/users")
def users():
    pass


@app.route("/posts")
def posts():
    pass
`);

      expect(routes.map(route => route.line)).toEqual([ 2, 7 ]);
    });
  });

  describe("lifecycle", () => {
    it("should mark the parser as destroyed", () => {
      parser.destroy();

      expect(parser.destroyed).toBe(true);
    });

    it("should clear supported HTTP methods on destroy", () => {
      parser.destroy();

      expect(parser.httpMethods.size).toBe(0);
    });

    it("should reject parsing after destruction", async () => {
      parser.destroy();

      await expect(
        parser.parse('@app.route("/users")')
      ).rejects.toThrow(
        "FlaskRouteParser has been destroyed."
      );
    });

    it("should allow repeated destruction", () => {
      parser.destroy();

      expect(() => parser.destroy()).not.toThrow();
    });
  });
});
