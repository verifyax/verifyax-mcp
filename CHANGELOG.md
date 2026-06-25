# Changelog

All notable changes to `@verifyax/sdk` and `@verifyax/mcp-server` are documented here. The two
packages are versioned in lockstep for v1.x. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-06-25

### Fixed

- `@verifyax/mcp-server`: the bin failed to start when launched via a symlink or junction (some
  pnpm-global / npx-cache layouts) — the main-module check compared `import.meta.url` (a realpath)
  against the raw `process.argv[1]`. It now resolves `realpath(argv[1])` first, so symlinked
  launches start correctly. Added a conformance regression test that launches through a junction.

## [0.1.0] - 2026-06-25

First public release. `@verifyax/sdk` and `@verifyax/mcp-server` published to npm.

### Added

- `@verifyax/sdk`: typed REST client with resource accessors (agents, scenarios, simulations,
  jobs, tags, usage), a typed error hierarchy, and in-SDK polling helpers.
- `@verifyax/sdk`: automatic retry of 429 and transient gateway errors (502/503/504) with
  exponential backoff honoring `Retry-After` (`maxRetries`, `retryBaseMs` options).
- `@verifyax/mcp-server`: MCP server over stdio exposing all 12 v1 tools, with structured tool
  errors and stderr JSON logging.
- Async scenario-failure messages are mapped to actionable `suggested_fix` hints.
- Documentation: top-level README, per-package READMEs, `docs/tool-descriptions.md`,
  `CONTRIBUTING.md`.

[Unreleased]: https://github.com/verifyax/verifyax-mcp/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/verifyax/verifyax-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/verifyax/verifyax-mcp/releases/tag/v0.1.0
