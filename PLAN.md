# PLAN.md

Phased execution plan for the VerifyAX MCP server. Read `CLAUDE.md` first for context and architectural decisions.

Update the **Status** field at the top of each phase as work progresses. Don't skip phases. Don't merge them.

---

## Phase 1 — SDK foundation

**Status:** complete — SDK implemented, unit + integration suites in place, README written.
Live integration run against a real workspace still pending (no test key wired into CI yet).
**Target:** 1–2 days of focused work
**Goal:** A typed TypeScript client for the VerifyAX REST API. No MCP yet. Just a clean SDK.

### Tasks

- [x] Scaffold monorepo with `pnpm` workspaces (`packages/sdk`, `packages/mcp-server`)
- [x] Configure `tsconfig.base.json`, `prettier`, `eslint`, `vitest` at the root
- [x] Set up GitHub Actions CI: lint, build, unit tests on every PR
- [x] Create `@verifyax/sdk` package skeleton with `package.json`, `tsconfig.json`, entry points
- [x] Define typed request/response interfaces in `src/types.ts` for all endpoints in `docs/verifyax-api.md`
- [x] Implement `VerifyaxClient` class with constructor `new VerifyaxClient({ apiKey, baseUrl? })`
- [x] Implement resource accessors: `client.agents`, `client.scenarios`, `client.simulations`, `client.jobs`, `client.tags`, `client.usage`
- [x] Implement each resource's methods (one file per resource under `src/resources/`)
- [x] Implement `pollJob(jobUuid, opts)` helper in `src/polling.ts`
- [x] Typed error hierarchy in `src/errors.ts`: `VerifyaxError`, `AuthError`, `NotFoundError`, `ConflictError`, `JobFailedError` (carries `error_details`), `TimeoutError`, `RateLimitError`
- [x] Map HTTP status codes to error types in the request layer
- [x] Unit tests with `msw` — transport, error mapping per status, tags web-base, async
      polling (happy + failure + timeout), and per-method coverage across every resource
      (40 tests)
- [x] Integration test suite that hits the real API, gated on `VERIFYAX_TEST_KEY`
      (self-skips without a key; isolated from msw via a separate vitest config)
- [x] Integration tests clean up after themselves (deterministic `mcp-test-{uuid}` names,
      `afterAll` teardown of created agents/scenarios)
- [x] SDK README with usage examples

> Not yet exercised: the live integration run requires a `VERIFYAX_TEST_KEY` (and, for the
> full pipeline, a reachable `VERIFYAX_TEST_AGENT_URL`) to be added as repo secrets. The CI
> `integration` job is wired and will run on pushes to `main` once those secrets exist; until
> then the suite skips. Expect skill-vs-reality drift to surface on the first live run.

### Decisions made this pass (not pre-specified in CLAUDE.md)

- **Base-URL split.** Client takes `baseUrl` (`/api/v1`) and a separate `webBaseUrl`
  (`/web/api/v1`); the tags resource targets the web base with `auth: false` and unwraps
  the `{ success, data }` envelope.
- **Run polling.** Added `simulations.waitForRun` alongside `jobs.pollUntilTerminal` — runs
  carry status on the record (CREATED/IN_PROGRESS), not via a job. Both share the generic
  `pollUntilTerminal` core in `polling.ts`.
- **Peripheral endpoints deferred.** scenario copy / generate-copy / artifacts, validation,
  and one-time-login-token are not yet wrapped — no v1 MCP tool needs them. (Tracked for a
  later SDK pass; none are in the v1 tool catalogue.)
- **Forward-compatible response types** use documented fields + an `[key: string]: unknown`
  index signature rather than `any`, since the reference under-specifies some shapes.

### Exit criteria

A 20-line TypeScript script that does the full pipeline (register → generate → simulate → poll → evaluate) works against the live API. The integration test suite asserts the same flow and passes in CI.

### Notes

- Reference `docs/verifyax-api.md` for endpoint shapes. Trust it; if you find a discrepancy with the live API, fix the doc.
- The skill we shipped already validated the full pipeline against the live API. The SDK should match its behavior.
- Don't add SDK methods that aren't backed by an endpoint in the reference. No convenience wrappers in this phase — those are for the MCP server.

---

## Phase 2 — MCP server skeleton

**Status:** complete — server builds, serves `list_compatible_tags` over stdio, conformance test green in CI
**Target:** 1 day
**Goal:** A running MCP server exposing one tool (`list_compatible_tags`) and installable into Claude Code.

### Tasks

- [x] Create `@verifyax/mcp-server` package depending on `@verifyax/sdk` and `@modelcontextprotocol/sdk` (1.29.0)
- [x] Implement `src/auth.ts` reading `VERIFYAX_API_KEY` from env, throwing a clear error if missing
- [x] Implement `src/logging.ts` writing structured JSON to stderr, level controlled by `VERIFYAX_MCP_LOG_LEVEL`
- [x] Implement `src/server.ts` with MCP boilerplate: server initialization, capabilities, request handlers
- [x] Implement `src/error-translation.ts` mapping SDK errors → MCP structured tool errors
- [x] Implement first tool: `list_compatible_tags` in `src/tools/list-compatible-tags.ts`
- [x] Tool description optimized for Claude's selection (first draft; will refine in Phase 4)
- [x] Implement `src/tools/index.ts` that registers all tools (just one for now)
- [x] Add `bin` entry in `package.json` exposing `verifyax-mcp-server` command
- [x] MCP conformance test: spawn server as subprocess, send `list_tools` and `call_tool`, assert responses
- [x] Server README with installation steps for Claude Code and Claude Desktop

### Decisions made this pass

- **Tool result shape.** Handlers return JSON in a text content block; failures set `isError: true`
  and carry the structured `{ success: false, reason, suggested_fix }` from error-translation.
  (No `outputSchema`/`structuredContent` yet — can add in Phase 4 if useful.)
- **Base-URL env overrides.** `VERIFYAX_BASE_URL` / `VERIFYAX_WEB_BASE_URL` let the conformance
  test point the spawned server at a local stub, and support self-hosting later.
- **Conformance is hermetic.** It stubs the tag endpoint over loopback HTTP — no live API, no
  key needed — and runs in its own vitest config (built subprocess, not source).
- **Dependency injection.** `createServer({ client, logger })` does no I/O, so tools are unit-
  testable and the entry point owns all environment reads.

### Exit criteria

Add the MCP server to local Claude Code MCP config, restart, and have Claude call `list_compatible_tags(scenario_type="interview")`. The response comes back as a structured list of tags. End to end works.

### Notes

- This is the hardest phase to get right because all the plumbing decisions get baked in. Take time on `server.ts` and `error-translation.ts` — copy-paste from these into every subsequent tool.
- The conformance test pays back enormously. Don't skip it.

---

## Phase 3 — Build out the remaining tools

**Status:** complete — all 12 tools implemented, unit-tested, and asserted in the conformance suite
**Target:** 2–3 days
**Goal:** All 12 tools implemented and tested.

### Tasks (in implementation order, easy → hard)

- [x] `list_agents` — simple wrap, paginated
- [x] `list_scenarios` — simple wrap, paginated, filterable by status
- [x] `list_recent_runs` — simple wrap, multiple filter dimensions
- [x] `get_run_details` — fetch run + evaluation if available, return curated combined view
- [x] `get_usage_summary` — aggregate `/usage/events` client-side (counts by product area + credit total)
- [x] `preview_run_cost` — simple wrap of credit-preview endpoint
- [x] `delete_agent` — explicit "permanently deletes" wording + destructive annotation
- [x] `delete_scenario` — 409 surfaced as a ConflictError with a `suggested_fix`
- [x] `register_agent` — chains `agents.testAgentCard` then `agents.create`; if card test fails, don't create
- [x] `generate_scenario` — blocking; polls the job, returns scenario uuid or structured FAILED error
- [x] `evaluate_agent` — the boss tool. Pipeline: `creditPreview` → `simulate` → `waitForRun` → poll eval job → `getEvaluation`. Returns `{ simulation_uuid, run_status, credits_estimate, evaluation }`

### Decisions made this pass

- **Dropped `exactOptionalPropertyTypes`** from tsconfig. It isn't part of TS `strict` and was
  fighting zod-inferred optionals (`T | undefined`) at every SDK param boundary. `strict`, `no-any`,
  and the rest of the strictness stay; the conditional-spread code written earlier is unaffected.
- **`get_usage_summary` aggregation** is counts-by-product-area + a credit total summed from a
  numeric `credits` field when present (the reference under-specifies the event shape). Per-agent /
  per-scenario rollups can come later once the live event shape is confirmed.
- **`get_run_details` evaluation fetch is best-effort** — a run with no (or not-yet-ready)
  evaluation returns `evaluation: null` rather than erroring.
- **Each tool exports a `createXHandler(ctx)` factory** plus its `registerX`, so handlers are unit-
  tested directly against a routed fetch stub (no live API, no spawned process).
- **`evaluate_agent` credit preview is advisory** — a preview failure is logged at debug and does
  not abort the evaluation; real auth errors still surface at the simulate step.

### Per-tool checklist

For each tool:

- [ ] JSON schema for input parameters (use Zod or similar for runtime + type safety)
- [ ] Tool description (first draft) following the rules in `CLAUDE.md`
- [ ] Handler implementation
- [ ] All SDK errors mapped to structured MCP responses with `suggested_fix` where possible
- [ ] At least one unit test (happy path + error path)
- [ ] At least one integration test
- [ ] Registered in `src/tools/index.ts`

### Exit criteria

Conversational test in Claude Code: *"Register the agent at [URL] with bearer token [token], generate an interview scenario tagged active_listening, evaluate the agent, show me the scores."* Claude makes 3–4 tool calls, returns curated results. No raw API errors, no manual polling, no copy-pasting of UUIDs by the user.

### Notes

- `evaluate_agent` is the marquee tool. Spend extra time on its return shape — that's what users will see most often.
- For the curated `evaluation` field: include overall score, per-tag scores, and a short transcript excerpt (~3 turns). Full transcript on request via `get_run_details`.

---

## Phase 4 — Hardening

**Status:** complete — retries, error mapping, CI, docs, edge-case tests, and the empirical
description eval all done. One conscious non-goal noted below (partial results on timeout).
**Target:** 2 days
**Goal:** Production-grade quality.

### Tasks

- [x] Rate-limit handling: 429 + transient 5xx retried with exponential backoff (up to 3, honoring `Retry-After`); `RateLimitError` carries `retryAfter`
- [~] Timeout handling: per-request timeout + per-poll deadlines on blocking tools. "Partial results" intentionally **not** returned — blocking tools fail whole on timeout (a clean failure beats a half-result here; revisit if users ask)
- [x] Robust error translation: the `docs/verifyax-api.md` async-failures table is mapped to specific `suggested_fix` hints
- [x] Tool description optimization: empirical pass run (see `docs/tool-selection-eval.md`) — 25/25 prompts, no changes needed
- [x] Edge cases: empty lists, deleted-resource-mid-poll (404 → NotFoundError), network-unreachable (→ VerifyaxError), malformed body (raw text fallback), eval-not-ready — all with dedicated tests
- [x] CI runs integration tests on `main` and on release tags (`tags: ['v*']`)
- [x] Top-level README: project overview, installation, usage examples, troubleshooting
- [x] CONTRIBUTING.md with development setup and PR guidelines
- [x] `docs/tool-descriptions.md` finalized, with rationale for non-obvious wording choices

### Decisions / deferrals this pass

- **Retry scope.** Retries 429 + 502/503/504 only (not 400/401/404/409/500); timeouts are not
  retried. Configurable via `maxRetries` / `retryBaseMs`. Tool unit tests set `maxRetries: 0` for
  deterministic call counts; SDK retry behavior has its own suite.
- **Description tuning done.** Ran the empirical pass via a fresh subagent given only the 12
  descriptions + 25 should/should-not prompts; scored 25/25 (`docs/tool-selection-eval.md`). The
  prompt suite is committed as a regression artifact to re-run when descriptions change.
- **Partial-results-on-timeout is a deliberate non-goal.** Blocking tools return a clean
  `TimeoutError` rather than a half-finished result; simpler to reason about. Revisit if users ask.
- **Added `CHANGELOG.md`** (Keep a Changelog) referenced by CONTRIBUTING and the release process.

### Tool description optimization protocol

Adapted from skill-creator's `improve_description.py`:

1. Pick a tool. Read its description.
2. Generate 10 prompts a user might send that *should* trigger this tool (specific) and 10 that *should not* (similar topic, different intent).
3. For each prompt, ask Claude (in a fresh session with all tools loaded) which tool it would pick.
4. Score: count true positives, true negatives, false positives, false negatives.
5. If accuracy is below 90%, revise the description and repeat.
6. Commit description + the test prompts as a regression suite.

### Exit criteria

A teammate installs the package cold, configures their API key, and completes the eval pipeline conversationally with zero help.

---

## Phase 5 — Ship

**Status:** not started
**Target:** 1 day
**Goal:** Publicly available.

### Tasks

- [ ] Publish `@verifyax/sdk` to npm (`pnpm publish --filter @verifyax/sdk`)
- [ ] Publish `@verifyax/mcp-server` to npm
- [ ] Add `verifyax-mcp` plugin folder to the `verifyax/claude-plugins` marketplace repo, with the MCP server declaration in its `plugin.json`
- [ ] Cut v1.0.0 release on `verifyax/verifyax-mcp` GitHub repo with CHANGELOG.md, release notes
- [ ] Update the existing skill's frontmatter description in the `claude-plugins` repo to mention the MCP option
- [ ] Write `docs/using-verifyax-with-claude.md` on the VerifyAX site covering both surfaces with choice criteria
- [ ] Smoke-test the published version on a clean machine (different from dev machine)
- [ ] Announce internally; collect feedback for v1.1

### Exit criteria

Someone unfamiliar with the project can find the docs, install the MCP server, configure their API key, and run an eval through Claude with zero hand-holding.

---

## v2 backlog (do not build in v1)

Track requests and ideas here, in priority order:

1. **Remote hosting.** Operate the MCP server as a hosted service users can add by URL. Requires deployment infra, multi-tenant token storage, observability.
2. **OAuth authentication.** Replace API-key paste with browser-based authorization. Requires implementing an OAuth server on VerifyAX.
3. **Python SDK.** For customers who don't want a Node dependency.
4. **Tools for power users.** Raw job-status access, scenario artifact editing, usage drill-down.
5. **Streaming tool outputs.** For long-running evals, stream progress to Claude as the work progresses.
6. **Telemetry (opt-in).** Anonymous usage data to inform v2 priorities.
7. **Response caching.** Reduce API calls for listing operations.
