
export const PLUGIN = Object.freeze({
  ID: "com.zylle.routelens",
  NAME: "RouteLens",
  VERSION: "1.0.0"
});

export const FRAMEWORKS = Object.freeze({
  FLASK: "flask",
  EXPRESS: "express",
  LARAVEL: "laravel",
  FASTAPI: "fastapi",
  DJANGO: "django",
  NESTJS: "nestjs"
});

export const FRAMEWORK_LABELS = Object.freeze({
  [ FRAMEWORKS.FLASK ]: "Flask",
  [ FRAMEWORKS.EXPRESS ]: "Express",
  [ FRAMEWORKS.LARAVEL ]: "Laravel",
  [ FRAMEWORKS.FASTAPI ]: "FastAPI",
  [ FRAMEWORKS.DJANGO ]: "Django",
  [ FRAMEWORKS.NESTJS ]: "NestJS"
});

export const HTTP_METHODS = Object.freeze([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "TRACE",
  "CONNECT"
]);

export const FRAMEWORK_EXTENSIONS = Object.freeze({
  [ FRAMEWORKS.FLASK ]: Object.freeze([
    ".py"
  ]),
  [ FRAMEWORKS.EXPRESS ]: Object.freeze([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts"
  ]),
  [ FRAMEWORKS.LARAVEL ]: Object.freeze([
    ".php"
  ]),
  [ FRAMEWORKS.FASTAPI ]: Object.freeze([
    ".py"
  ]),
  [ FRAMEWORKS.DJANGO ]: Object.freeze([
    ".py"
  ]),
  [ FRAMEWORKS.NESTJS ]: Object.freeze([
    ".js",
    ".ts"
  ])
});

export const DEFAULT_SCAN_SETTINGS = Object.freeze({
  frameworks: Object.freeze([
    FRAMEWORKS.FLASK,
    FRAMEWORKS.EXPRESS,
    FRAMEWORKS.LARAVEL
  ]),
  excludedDirectories: Object.freeze([
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "vendor",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    "coverage"
  ]),
  maxDepth: 20,
  maxFiles: 10000,
  maxFileSize: 1024 * 1024
});

export const ROUTE_METADATA = Object.freeze({
  DEFAULT_FRAMEWORK: "unknown",
  DEFAULT_METHOD: "GET",
  UNKNOWN_HANDLER: "Unknown handler"
});

export const ROUTE_EVENTS = Object.freeze({
  ADDED: "route:added",
  UPDATED: "route:updated",
  REMOVED: "route:removed",
  CLEARED: "routes:cleared",
  SCAN_STARTED: "scan:started",
  SCAN_COMPLETED: "scan:completed",
  SCAN_FAILED: "scan:failed"
});

export const WORKSPACE_EVENTS = Object.freeze({
  CHANGED: "workspace:changed",
  DETECTED: "workspace:detected",
  CLEARED: "workspace:cleared"
});

export const CONTROLLER_EVENTS = Object.freeze({
  INITIALIZED: "controller:initialized",
  DESTROYED: "controller:destroyed"
});

export const EXPORT_FORMATS = Object.freeze({
  MARKDOWN: "markdown",
  JSON: "json"
});

export const FILE_NAMES = Object.freeze({
  PLUGIN_MANIFEST: "plugin.json",
  PACKAGE_MANIFEST: "package.json",
  COMPOSER_MANIFEST: "composer.json",
  REQUIREMENTS: "requirements.txt",
  PYPROJECT: "pyproject.toml"
});

export const UI = Object.freeze({
  PANEL_ID: "routelens-panel",
  ROOT_CLASS: "routelens",
  SELECTED_CLASS: "is-selected",
  ACTIVE_CLASS: "is-active",
  HIDDEN_CLASS: "is-hidden"
});

export const LIMITS = Object.freeze({
  MAX_ROUTE_PATH_LENGTH: 2048,
  MAX_METHODS_PER_ROUTE: 9,
  MAX_SEARCH_RESULTS: 1000,
  MAX_EXPORT_ROUTES: 50000
});

const Constants = Object.freeze({
  PLUGIN,
  FRAMEWORKS,
  FRAMEWORK_LABELS,
  HTTP_METHODS,
  FRAMEWORK_EXTENSIONS,
  DEFAULT_SCAN_SETTINGS,
  ROUTE_METADATA,
  ROUTE_EVENTS,
  WORKSPACE_EVENTS,
  CONTROLLER_EVENTS,
  EXPORT_FORMATS,
  FILE_NAMES,
  UI,
  LIMITS
});

export default Constants;
