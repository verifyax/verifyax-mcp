# Changelog

All notable changes to `@verifyax/sdk` and `@verifyax/mcp-server` are documented here. The two
packages are versioned in lockstep for v1.x. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `@verifyax/sdk`: `SimulationsResource.list` now correctly handles the paginated envelope returned by the live API (fixing a regression where it expected a bare array and failed with `runs.map is not a function`).
- `@verifyax/mcp-server`: `list_recent_runs` tool is now resilient to non-array responses from the SDK.

## [0.3.0] - 2026-07-14

Minor release: regenerate SDK types from the fixed OpenAPI spec and drop the
hand-added spec overrides (issue #25). Includes a breaking change to the
`get_usage_summary` tool output.

### Changed
- `@verifyax/sdk`: regenerated `types.gen.ts` from the updated OpenAPI mirror.
  `UsageEvent` now aliases the spec's `UsageEventResponse` directly (the
  `credits`/`event_uuid` manual intersection is gone); per-event spend is read
  from `actual_total_event_cost`.
- `@verifyax/sdk`: `EvaluationScores` and the score/evaluation-report SDK
  methods now unwrap the gateway's `{ success, data }` envelope instead of
  relying on the live API returning the inner shape directly.
- `@verifyax/sdk`: `BillingBalance` now aliases `PublicBillingBalanceResponse`
  instead of a hand-written interface.

### Removed
- `@verifyax/sdk`: the `credits?` and `event_uuid?` overrides on `UsageEvent`.
- `@verifyax/sdk`: the "spec wraps this in an envelope" override note on
  `EvaluationScores`.

### Breaking
- `@verifyax/mcp-server`: `get_usage_summary` output field `total_credits` is
  renamed to `total_spend_usd` (now sourced from `actual_total_event_cost`,
  representing USD platform spend, not billing credits).

## [0.2.1] - 2026-06-28

Patch release: list `@verifyax/mcp-server` in the official MCP registry. No runtime changes.

### Added

- `@verifyax/mcp-server`: `server.json` (repo root) declaring the server for the MCP registry
  under the `io.github.verifyax` namespace, and an `mcpName` field in `package.json` so the
  registry can verify npm-package ownership.

## [0.2.0] - 2026-06-26

Minor release: remote HTTP transport + a broad API sync with the updated skill. Includes a
**breaking** change to the tag catalogue (see below).

### Added

- `@verifyax/mcp-server`: Streamable HTTP transport (`verifyax-mcp-server-http` bin) with
  per-request API-key auth (`Authorization: Bearer` / `X-VerifyAX-API-Key`), plus a GCP Cloud
  Run deployment under `deploy/gcp/`.
- `@verifyax/sdk`: `agents.testApiAgentDirectline` (Copilot Studio Direct Line connectivity
  probe) and Direct Line agent parameters.
- `@verifyax/sdk`: MCP agent type + `agent_parameters.mcp`; new connectivity probes
  `agents.testA2aConnection`, `agents.testA2aMessage`, `agents.testMcpConnection`;
  `scenarios.generateFromQna`; `simulations.listForScenario`, `getEvaluationReport`,
  `getEvaluationScores`, `getScores` (batch), `getOutput`; `usage.getBalance` (`/billing/balance`).
- `@verifyax/sdk`: `simulate` accepts `scenario_uuids` (batch) and `timeout_minutes`;
  `credit-preview` accepts `timeout_minutes`; `generate` accepts `description`.
- `@verifyax/sdk`: binary downloads via a `responseType: 'arrayBuffer'` request option, exposed as
  `simulations.downloadFile(uuid, path)` (run artifacts → `Uint8Array`); `client.logs.list` audit
  log access; `tags.registerQna` (org QnA benchmark tag registration).

### Changed

- **Breaking (SDK):** the tag catalogue is now fetched from the authed `/api/v1/tags` and returned
  as a **bare JSON array** (was the no-auth `/web/api/v1` `{ success, data }` envelope). `Tag`
  gains `custom` (replacing `client_specific`), and `benchmark_family` may be a string **array**.
- `agent_type` now includes `DIRECTLINE`, `EXTENSION`, `MCP`; `credit-preview` accepts
  `scenario_generation`; error-body parsing now reads `detail` (gateway proxy / underlying-API
  errors) in addition to `message`/`error`.
- `list_compatible_tags` handles array-valued `benchmark_family` when filtering.
- `generate_scenario` tool: dropped `timeout_minutes` (no longer a generate field — it moved to
  the simulate/run step) and added optional `description`.

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

[Unreleased]: https://github.com/verifyax/verifyax-mcp/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/verifyax/verifyax-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/verifyax/verifyax-mcp/releases/tag/v0.2.0
[0.1.1]: https://github.com/verifyax/verifyax-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/verifyax/verifyax-mcp/releases/tag/v0.1.0
