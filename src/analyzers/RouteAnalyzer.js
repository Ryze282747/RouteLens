import RouteNormalizer from "./RouteNormalizer.js";
import ConflictDetector from "./ConflictDetector.js";
import DuplicateRouteDetector from "./DuplicateRouteDetector.js";
import FrontendMatcher from "./FrontendMatcher.js";

export default class RouteAnalyzer {
  constructor(options = {}) {
    const {
      normalizer,
      conflictDetector,
      duplicateDetector,
      frontendMatcher
    } = options;

    this.ownsNormalizer = normalizer === undefined;
    this.ownsConflictDetector = conflictDetector === undefined;
    this.ownsDuplicateDetector = duplicateDetector === undefined;
    this.ownsFrontendMatcher = frontendMatcher === undefined;

    this.normalizer = this.ownsNormalizer
      ? new RouteNormalizer()
      : normalizer;

    this.conflictDetector = this.ownsConflictDetector
      ? new ConflictDetector()
      : conflictDetector;

    this.duplicateDetector = this.ownsDuplicateDetector
      ? new DuplicateRouteDetector()
      : duplicateDetector;

    this.frontendMatcher = this.ownsFrontendMatcher
      ? new FrontendMatcher()
      : frontendMatcher;

    this.destroyed = false;
    this.lastResult = null;
  }

  analyze(routes, options = {}) {
    this.ensureActive();

    if (!Array.isArray(routes)) {
      throw new TypeError(
        "Routes must be provided as an array."
      );
    }

    const normalizedRoutes =
      this.normalizer.normalizeMany(routes);

    const duplicates =
      this.duplicateDetector.analyze(normalizedRoutes);

    const conflicts =
      this.conflictDetector.analyze(normalizedRoutes);

    const frontendCalls = Array.isArray(options.frontendCalls)
      ? options.frontendCalls
      : [];

    const frontendAnalysis =
      options.includeFrontend === true
        ? this.frontendMatcher.analyze(
          frontendCalls,
          normalizedRoutes
        )
        : null;

    const result = {
      summary: {
        totalRoutes: normalizedRoutes.length,
        totalDuplicates: duplicates.length,
        totalConflicts: conflicts.length,
        totalFrontendCalls: frontendAnalysis?.total || 0,
        matchedFrontendCalls: frontendAnalysis?.matched || 0,
        unmatchedFrontendCalls: frontendAnalysis?.unmatched || 0,
        ambiguousFrontendCalls: frontendAnalysis?.ambiguous || 0
      },
      routes: normalizedRoutes,
      duplicates,
      conflicts,
      frontend: frontendAnalysis,
      analyzedAt: Date.now()
    };

    this.lastResult = result;

    return result;
  }

  getLastResult() {
    this.ensureActive();
    return this.lastResult;
  }

  clearResult() {
    this.ensureActive();
    this.lastResult = null;
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("RouteAnalyzer has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    const components = [
      {
        instance: this.normalizer,
        owned: this.ownsNormalizer
      },
      {
        instance: this.conflictDetector,
        owned: this.ownsConflictDetector
      },
      {
        instance: this.duplicateDetector,
        owned: this.ownsDuplicateDetector
      },
      {
        instance: this.frontendMatcher,
        owned: this.ownsFrontendMatcher
      }
    ];

    for (const { instance, owned } of components) {
      if (
        !owned ||
        !instance ||
        typeof instance.destroy !== "function"
      ) {
        continue;
      }

      try {
        instance.destroy();
      } catch (error) {
        console.error(
          "[RouteLens] Analyzer cleanup failed:",
          error
        );
      }
    }

    this.normalizer = null;
    this.conflictDetector = null;
    this.duplicateDetector = null;
    this.frontendMatcher = null;

    this.ownsNormalizer = false;
    this.ownsConflictDetector = false;
    this.ownsDuplicateDetector = false;
    this.ownsFrontendMatcher = false;

    this.lastResult = null;
    this.destroyed = true;
  }
}
