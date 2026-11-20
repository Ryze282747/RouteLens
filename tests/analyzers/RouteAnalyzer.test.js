import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteAnalyzer from "../../src/analyzers/RouteAnalyzer.js";
import RouteNormalizer from "../../src/analyzers/RouteNormalizer.js";
import ConflictDetector from "../../src/analyzers/ConflictDetector.js";
import DuplicateRouteDetector from "../../src/analyzers/DuplicateRouteDetector.js";
import FrontendMatcher from "../../src/analyzers/FrontendMatcher.js";

describe("RouteAnalyzer", () => {
  let analyzer;
  let normalizer;
  let conflictDetector;
  let duplicateDetector;
  let frontendMatcher;

  const createRoute = (overrides = {}) => ({
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    framework: "express",
    file: "routes/users.js",
    ...overrides
  });

  function createDependencies() {
    normalizer = {
      normalizeMany: vi.fn((routes) =>
        routes.map((route) => ({
          ...route,
          normalized: true
        }))
      ),
      destroy: vi.fn()
    };

    duplicateDetector = {
      analyze: vi.fn(() => []),
      destroy: vi.fn()
    };

    conflictDetector = {
      analyze: vi.fn(() => []),
      destroy: vi.fn()
    };

    frontendMatcher = {
      analyze: vi.fn(() => ({
        total: 0,
        matched: 0,
        unmatched: 0,
        ambiguous: 0,
        matches: [],
        unmatchedCalls: [],
        ambiguousCalls: []
      })),
      destroy: vi.fn()
    };

    return {
      normalizer,
      duplicateDetector,
      conflictDetector,
      frontendMatcher
    };
  }

  beforeEach(() => {
    createDependencies();

    analyzer = new RouteAnalyzer({
      normalizer,
      conflictDetector,
      duplicateDetector,
      frontendMatcher
    });
  });

  afterEach(() => {
    if (analyzer && !analyzer.destroyed) {
      analyzer.destroy();
    }

    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize without being destroyed", () => {
      expect(analyzer.destroyed).toBe(false);
    });

    it("should initialize lastResult as null", () => {
      expect(analyzer.lastResult).toBeNull();
    });

    it("should store injected dependencies", () => {
      expect(analyzer.normalizer).toBe(normalizer);
      expect(analyzer.conflictDetector).toBe(conflictDetector);
      expect(analyzer.duplicateDetector).toBe(duplicateDetector);
      expect(analyzer.frontendMatcher).toBe(frontendMatcher);
    });

    it("should create default analyzer dependencies", () => {
      const instance = new RouteAnalyzer();

      expect(instance.normalizer).toBeInstanceOf(RouteNormalizer);
      expect(instance.conflictDetector).toBeInstanceOf(ConflictDetector);
      expect(instance.duplicateDetector).toBeInstanceOf(DuplicateRouteDetector);
      expect(instance.frontendMatcher).toBeInstanceOf(FrontendMatcher);

      expect(instance.ownsNormalizer).toBe(true);
      expect(instance.ownsConflictDetector).toBe(true);
      expect(instance.ownsDuplicateDetector).toBe(true);
      expect(instance.ownsFrontendMatcher).toBe(true);

      instance.destroy();
    });

    it("should accept an empty options object", () => {
      const instance = new RouteAnalyzer({});

      expect(instance.destroyed).toBe(false);

      instance.destroy();
    });

    it("should mark injected dependencies as caller-owned", () => {
      expect(analyzer.ownsNormalizer).toBe(false);
      expect(analyzer.ownsConflictDetector).toBe(false);
      expect(analyzer.ownsDuplicateDetector).toBe(false);
      expect(analyzer.ownsFrontendMatcher).toBe(false);
    });
  });

  describe("analyze()", () => {
    it("should reject non-array routes", () => {
      expect(() => analyzer.analyze(null)).toThrow(
        "Routes must be provided as an array."
      );

      expect(() => analyzer.analyze({})).toThrow(
        "Routes must be provided as an array."
      );

      expect(() => analyzer.analyze("invalid")).toThrow(
        "Routes must be provided as an array."
      );
    });

    it("should accept an empty routes array", () => {
      const result = analyzer.analyze([]);

      expect(result.summary.totalRoutes).toBe(0);
      expect(result.routes).toEqual([]);
    });

    it("should normalize routes before running other analyzers", () => {
      const routes = [ createRoute() ];

      analyzer.analyze(routes);

      expect(normalizer.normalizeMany).toHaveBeenCalledWith(routes);
      expect(duplicateDetector.analyze).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            normalized: true
          })
        ])
      );
      expect(conflictDetector.analyze).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            normalized: true
          })
        ])
      );
    });

    it("should run duplicate detection", () => {
      const duplicates = [
        {
          id: "duplicate-1",
          routes: []
        }
      ];

      duplicateDetector.analyze.mockReturnValue(duplicates);

      const result = analyzer.analyze([ createRoute() ]);

      expect(duplicateDetector.analyze).toHaveBeenCalledTimes(1);
      expect(result.duplicates).toBe(duplicates);
      expect(result.summary.totalDuplicates).toBe(1);
    });

    it("should run conflict detection", () => {
      const conflicts = [
        {
          id: "conflict-1",
          type: "exact"
        }
      ];

      conflictDetector.analyze.mockReturnValue(conflicts);

      const result = analyzer.analyze([ createRoute() ]);

      expect(conflictDetector.analyze).toHaveBeenCalledTimes(1);
      expect(result.conflicts).toBe(conflicts);
      expect(result.summary.totalConflicts).toBe(1);
    });

    it("should return normalized routes", () => {
      const result = analyzer.analyze([
        createRoute()
      ]);

      expect(result.routes).toEqual([
        expect.objectContaining({
          id: "route-1",
          normalized: true
        })
      ]);
    });

    it("should calculate the total route count", () => {
      const result = analyzer.analyze([
        createRoute({
          id: "route-1"
        }),
        createRoute({
          id: "route-2",
          path: "/products"
        }),
        createRoute({
          id: "route-3",
          path: "/orders"
        })
      ]);

      expect(result.summary.totalRoutes).toBe(3);
    });

    it("should initialize frontend summary values to zero when disabled", () => {
      const result = analyzer.analyze([
        createRoute()
      ]);

      expect(result.summary).toMatchObject({
        totalFrontendCalls: 0,
        matchedFrontendCalls: 0,
        unmatchedFrontendCalls: 0,
        ambiguousFrontendCalls: 0
      });

      expect(result.frontend).toBeNull();
      expect(frontendMatcher.analyze).not.toHaveBeenCalled();
    });

    it("should include frontend analysis when explicitly enabled", () => {
      const frontendCalls = [
        {
          method: "GET",
          path: "/users"
        }
      ];

      const frontendResult = {
        total: 1,
        matched: 1,
        unmatched: 0,
        ambiguous: 0,
        matches: [ {} ],
        unmatchedCalls: [],
        ambiguousCalls: []
      };

      frontendMatcher.analyze.mockReturnValue(frontendResult);

      const result = analyzer.analyze(
        [ createRoute() ],
        {
          includeFrontend: true,
          frontendCalls
        }
      );

      expect(frontendMatcher.analyze).toHaveBeenCalledWith(
        expect.any(Array),
        result.routes
      );

      expect(result.frontend).toBe(frontendResult);
    });

    it("should copy frontend analysis counts into the summary", () => {
      frontendMatcher.analyze.mockReturnValue({
        total: 10,
        matched: 6,
        unmatched: 3,
        ambiguous: 1,
        matches: [],
        unmatchedCalls: [],
        ambiguousCalls: []
      });

      const result = analyzer.analyze(
        [ createRoute() ],
        {
          includeFrontend: true,
          frontendCalls: []
        }
      );

      expect(result.summary).toMatchObject({
        totalFrontendCalls: 10,
        matchedFrontendCalls: 6,
        unmatchedFrontendCalls: 3,
        ambiguousFrontendCalls: 1
      });
    });

    it("should use an empty frontend calls array when the option is missing", () => {
      frontendMatcher.analyze.mockReturnValue({
        total: 0,
        matched: 0,
        unmatched: 0,
        ambiguous: 0
      });

      analyzer.analyze(
        [ createRoute() ],
        {
          includeFrontend: true
        }
      );

      expect(frontendMatcher.analyze).toHaveBeenCalledWith(
        [],
        expect.any(Array)
      );
    });

    it("should use an empty frontend calls array when the option is not an array", () => {
      frontendMatcher.analyze.mockReturnValue({
        total: 0,
        matched: 0,
        unmatched: 0,
        ambiguous: 0
      });

      analyzer.analyze(
        [ createRoute() ],
        {
          includeFrontend: true,
          frontendCalls: "invalid"
        }
      );

      expect(frontendMatcher.analyze).toHaveBeenCalledWith(
        [],
        expect.any(Array)
      );
    });

    it("should not enable frontend analysis for a truthy non-boolean value", () => {
      const result = analyzer.analyze(
        [ createRoute() ],
        {
          includeFrontend: 1,
          frontendCalls: []
        }
      );

      expect(frontendMatcher.analyze).not.toHaveBeenCalled();
      expect(result.frontend).toBeNull();
    });

    it("should not enable frontend analysis for false", () => {
      const result = analyzer.analyze(
        [ createRoute() ],
        {
          includeFrontend: false,
          frontendCalls: []
        }
      );

      expect(frontendMatcher.analyze).not.toHaveBeenCalled();
      expect(result.frontend).toBeNull();
    });

    it("should include an analyzedAt timestamp", () => {
      vi.spyOn(Date, "now").mockReturnValue(123456789);

      const result = analyzer.analyze([ createRoute() ]);

      expect(result.analyzedAt).toBe(123456789);
    });

    it("should return all expected result properties", () => {
      const result = analyzer.analyze([ createRoute() ]);

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("duplicates");
      expect(result).toHaveProperty("conflicts");
      expect(result).toHaveProperty("frontend");
      expect(result).toHaveProperty("analyzedAt");
    });

    it("should save the latest analysis result", () => {
      const result = analyzer.analyze([ createRoute() ]);

      expect(analyzer.lastResult).toBe(result);
    });

    it("should replace the previous result after another analysis", () => {
      const first = analyzer.analyze([
        createRoute()
      ]);

      const second = analyzer.analyze([
        createRoute({
          id: "route-2",
          path: "/products"
        })
      ]);

      expect(second).not.toBe(first);
      expect(analyzer.lastResult).toBe(second);
    });

    it("should propagate normalizer errors", () => {
      normalizer.normalizeMany.mockImplementation(() => {
        throw new Error("Normalization failed.");
      });

      expect(() => analyzer.analyze([ createRoute() ])).toThrow(
        "Normalization failed."
      );
    });

    it("should propagate duplicate detector errors", () => {
      duplicateDetector.analyze.mockImplementation(() => {
        throw new Error("Duplicate detection failed.");
      });

      expect(() => analyzer.analyze([ createRoute() ])).toThrow(
        "Duplicate detection failed."
      );
    });

    it("should propagate conflict detector errors", () => {
      conflictDetector.analyze.mockImplementation(() => {
        throw new Error("Conflict detection failed.");
      });

      expect(() => analyzer.analyze([ createRoute() ])).toThrow(
        "Conflict detection failed."
      );
    });

    it("should propagate frontend matcher errors", () => {
      frontendMatcher.analyze.mockImplementation(() => {
        throw new Error("Frontend matching failed.");
      });

      expect(() =>
        analyzer.analyze(
          [ createRoute() ],
          {
            includeFrontend: true,
            frontendCalls: []
          }
        )
      ).toThrow("Frontend matching failed.");
    });

    it("should preserve the previous result when a later analysis fails", () => {
      const first = analyzer.analyze([
        createRoute()
      ]);

      normalizer.normalizeMany.mockImplementation(() => {
        throw new Error("Normalization failed.");
      });

      expect(() =>
        analyzer.analyze([
          createRoute({
            id: "route-2"
          })
        ])
      ).toThrow("Normalization failed.");

      expect(analyzer.lastResult).toBe(first);
    });

    it("should not run later analyzers when normalization fails", () => {
      normalizer.normalizeMany.mockImplementation(() => {
        throw new Error("Normalization failed.");
      });

      expect(() => analyzer.analyze([ createRoute() ])).toThrow();

      expect(duplicateDetector.analyze).not.toHaveBeenCalled();
      expect(conflictDetector.analyze).not.toHaveBeenCalled();
    });
  });

  describe("getLastResult()", () => {
    it("should initially return null", () => {
      expect(analyzer.getLastResult()).toBeNull();
    });

    it("should return the latest analysis result", () => {
      const result = analyzer.analyze([
        createRoute()
      ]);

      expect(analyzer.getLastResult()).toBe(result);
    });
  });

  describe("clearResult()", () => {
    it("should clear the latest result", () => {
      analyzer.analyze([
        createRoute()
      ]);

      analyzer.clearResult();

      expect(analyzer.lastResult).toBeNull();
    });

    it("should allow clearing an already empty result", () => {
      expect(() => analyzer.clearResult()).not.toThrow();
      expect(analyzer.lastResult).toBeNull();
    });

    it("should allow another analysis after clearing the result", () => {
      analyzer.analyze([
        createRoute()
      ]);

      analyzer.clearResult();

      const result = analyzer.analyze([
        createRoute({
          id: "route-2"
        })
      ]);

      expect(analyzer.getLastResult()).toBe(result);
    });
  });

  describe("lifecycle", () => {
    it("should mark the analyzer as destroyed", () => {
      analyzer.destroy();

      expect(analyzer.destroyed).toBe(true);
    });

    it("should clear the last result on destruction", () => {
      analyzer.analyze([
        createRoute()
      ]);

      analyzer.destroy();

      expect(analyzer.lastResult).toBeNull();
    });

    it("should null all dependencies on destruction", () => {
      analyzer.destroy();

      expect(analyzer.normalizer).toBeNull();
      expect(analyzer.conflictDetector).toBeNull();
      expect(analyzer.duplicateDetector).toBeNull();
      expect(analyzer.frontendMatcher).toBeNull();
    });

    it("should not destroy injected dependencies", () => {
      analyzer.destroy();

      expect(normalizer.destroy).not.toHaveBeenCalled();
      expect(conflictDetector.destroy).not.toHaveBeenCalled();
      expect(duplicateDetector.destroy).not.toHaveBeenCalled();
      expect(frontendMatcher.destroy).not.toHaveBeenCalled();
    });

    it("should destroy internally created dependencies", () => {
      const instance = new RouteAnalyzer();

      const ownedNormalizer = instance.normalizer;
      const ownedConflictDetector = instance.conflictDetector;
      const ownedDuplicateDetector = instance.duplicateDetector;
      const ownedFrontendMatcher = instance.frontendMatcher;

      const spies = [
        vi.spyOn(ownedNormalizer, "destroy"),
        vi.spyOn(ownedConflictDetector, "destroy"),
        vi.spyOn(ownedDuplicateDetector, "destroy"),
        vi.spyOn(ownedFrontendMatcher, "destroy")
      ];

      instance.destroy();

      for (const spy of spies) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });

    it("should destroy only internally created dependencies when ownership is mixed", () => {
      const customNormalizer = {
        normalizeMany: vi.fn(() => []),
        destroy: vi.fn()
      };

      const customFrontendMatcher = {
        analyze: vi.fn(() => ({})),
        destroy: vi.fn()
      };

      const instance = new RouteAnalyzer({
        normalizer: customNormalizer,
        frontendMatcher: customFrontendMatcher
      });

      const ownedConflictDetector = instance.conflictDetector;
      const ownedDuplicateDetector = instance.duplicateDetector;

      const conflictDestroy = vi.spyOn(
        ownedConflictDetector,
        "destroy"
      );

      const duplicateDestroy = vi.spyOn(
        ownedDuplicateDetector,
        "destroy"
      );

      instance.destroy();

      expect(customNormalizer.destroy).not.toHaveBeenCalled();
      expect(customFrontendMatcher.destroy).not.toHaveBeenCalled();

      expect(conflictDestroy).toHaveBeenCalledTimes(1);
      expect(duplicateDestroy).toHaveBeenCalledTimes(1);
    });

    it("should allow destroy() to be called more than once", () => {
      analyzer.destroy();

      expect(() => analyzer.destroy()).not.toThrow();

      expect(normalizer.destroy).not.toHaveBeenCalled();
      expect(conflictDetector.destroy).not.toHaveBeenCalled();
      expect(duplicateDetector.destroy).not.toHaveBeenCalled();
      expect(frontendMatcher.destroy).not.toHaveBeenCalled();
    });

    it("should handle dependencies without destroy methods", () => {
      const instance = new RouteAnalyzer({
        normalizer: {
          normalizeMany: vi.fn(() => [])
        },
        conflictDetector: {
          analyze: vi.fn(() => [])
        },
        duplicateDetector: {
          analyze: vi.fn(() => [])
        },
        frontendMatcher: {
          analyze: vi.fn(() => ({}))
        }
      });

      expect(() => instance.destroy()).not.toThrow();
    });

    it("should continue cleanup when an owned dependency destroy method throws", () => {
      const instance = new RouteAnalyzer();

      const error = new Error("Cleanup failed.");

      const normalizerDestroy = vi
        .spyOn(instance.normalizer, "destroy")
        .mockImplementation(() => {
          throw error;
        });

      const conflictDestroy = vi.spyOn(
        instance.conflictDetector,
        "destroy"
      );

      const duplicateDestroy = vi.spyOn(
        instance.duplicateDetector,
        "destroy"
      );

      const frontendDestroy = vi.spyOn(
        instance.frontendMatcher,
        "destroy"
      );

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      expect(() => instance.destroy()).not.toThrow();

      expect(normalizerDestroy).toHaveBeenCalledTimes(1);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RouteLens] Analyzer cleanup failed:",
        error
      );

      expect(conflictDestroy).toHaveBeenCalledTimes(1);
      expect(duplicateDestroy).toHaveBeenCalledTimes(1);
      expect(frontendDestroy).toHaveBeenCalledTimes(1);

      expect(instance.destroyed).toBe(true);
    });

    it("should throw when analyze() is called after destruction", () => {
      analyzer.destroy();

      expect(() => analyzer.analyze([])).toThrow(
        "RouteAnalyzer has been destroyed."
      );
    });

    it("should throw when getLastResult() is called after destruction", () => {
      analyzer.destroy();

      expect(() => analyzer.getLastResult()).toThrow(
        "RouteAnalyzer has been destroyed."
      );
    });

    it("should throw when clearResult() is called after destruction", () => {
      analyzer.destroy();

      expect(() => analyzer.clearResult()).toThrow(
        "RouteAnalyzer has been destroyed."
      );
    });
  });
});
