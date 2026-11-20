# Changelog

All notable changes to RouteLens will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-20

### Added

- Initial public release of RouteLens for Acode.
- Modular architecture for framework-specific route scanning.
- Automatic API route discovery through static source-code analysis.
- Flask route scanner.
- Express route scanner with nested router and prefix resolution.
- Laravel route scanner with route group and API prefix resolution.
- FastAPI route scanner with router prefix resolution.
- Django route scanner with URL configuration and class-based view support.
- NestJS route scanner with controller, module, and global prefix resolution.
- Route registry and route normalization.
- Route exploration interface.
- Route grouping by path, framework, and source file.
- Route search and filtering.
- Route details and source navigation.
- Automatic workspace file-change detection.
- Automatic workspace rescanning with debounced updates.
- Modular event management and workspace monitoring.
- Production build configuration using esbuild.
- Plugin documentation and MIT license.

### Technical

- Added framework-independent scanner architecture.
- Added workspace and filesystem adapters.
- Added route registry synchronization.
- Added support for multiple HTTP methods.
- Added mock-project validation for supported framework scanners.
- Added automated test suite.

## [Unreleased]

No unreleased changes yet.