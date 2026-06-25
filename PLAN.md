# PLAN.md

Phased execution plan for the VerifyAX MCP server. Read `CLAUDE.md` first for context and architectural decisions.

Update the **Status** field at the top of each phase as work progresses. Don't skip phases. Don't merge them.

---

## Phase 1 — SDK foundation

**Status:** in progress — monorepo scaffold landed; SDK implementation next
**Target:** 1–2 days of focused work
**Goal:** A typed TypeScript client for the VerifyAX REST API. No MCP yet. Just a clean SDK.

### Tasks

- [x] Scaffold monorepo with `pnpm` workspaces (`packages/sdk`, `packages/mcp-server`)
- [x] Configure `tsconfig.base.json`, `prettier`, `eslint`, `vitest` at the root
- [x] Set up GitHub Actions CI: lint, build, unit tests on every PR
- [x] Create `@verifyax/sdk` package skeleton with `package.json`, `tsconfig.json`, entry points
- [ ] Define typed request/response interfaces in `src/types.ts` for all endpoints in `docs/verifyax-api.md`
- [ ] Implement `VerifyaxClient` class with constructor `new VerifyaxClient({ apiKey, baseUrl? })`
- [ ] Implement resource accessors: `client.agents`, `client.scenarios`, `client.simulations`, `client.jobs`, `client.tags`, `client.usage`
- [ ] Implement each resource's methods (one file per resource under `src/resources/`)
- [ ] Implement `pollJob(jobUuid, opts)` helper in `src/polling.ts`
- [ ] Typed error hierarchy in `src/errors.ts`: `VerifyaxError`, `AuthError`, `NotFoundError`, `ConflictError`, `JobFailedError` (carries `error_details`), `TimeoutError`, `RateLimitError`
- [ ] Map HTTP status codes to error types in the request layer
- [ ] Unit tests with `msw` mocking each endpoint — happy path + at least one error path per method
- [ ] Integration test suite that hits the real API, gated on `VERIFYAX_TEST_KEY`
- [ ] Integration tests clean up after themselves (deterministic resource names, teardown helpers)
- [ ] SDK README with usage examples

### Exit criteria

A 20-line TypeScript script that does the full pipeline (register → generate → simulate → poll → evaluate) works against the live API. The integration test suite asserts the same flow and passes in CI.

### Notes

- Reference `docs/verifyax-api.md` for endpoint shapes. Trust it; if you find a discrepancy with the live API, fix the doc.
- The skill we shipped already validated the full pipeline against the live API. The SDK should match its behavior.
- Don't add SDK methods that aren't backed by an endpoint in the reference. No convenience wrappers in this phase — those are for the MCP server.

---

## Phase 2 — MCP server skeleton

**Status:** not started
**Target:** 1 day
**Goal:** A running MCP server exposing one tool (`list_compatible_tags`) and installable into Claude Code.

### Tasks

- [ ] Create `@verifyax/mcp-server` package depending on `@verifyax/sdk` and `@modelcontextprotocol/sdk`
- [ ] Implement `src/auth.ts` reading `VERIFYAX_API_KEY` from env, throwing a clear error if missing
- [ ] Implement `src/logging.ts` writing structured JSON to stderr, level controlled by `VERIFYAX_MCP_LOG_LEVEL`
- [ ] Implement `src/server.ts` with MCP boilerplate: server initialization, capabilities, request handlers
- [ ] Implement `src/error-translation.ts` mapping SDK errors → MCP structured tool errors
- [ ] Implement first tool: `list_compatible_tags` in `src/tools/list-compatible-tags.ts`
- [ ] Tool description optimized for Claude's selection (first draft; will refine in Phase 4)
- [ ] Implement `src/tools/index.ts` that registers all tools (just one for now)
- [ ] Add `bin` entry in `package.json` exposing `verifyax-mcp-server` command
- [ ] MCP conformance test: spawn server as subprocess, send `list_tools` and `call_tool`, assert responses
- [ ] Server README with installation steps for Claude Code and Claude Desktop

### Exit criteria

Add the MCP server to local Claude Code MCP config, restart, and have Claude call `list_compatible_tags(scenario_type="interview")`. The response comes back as a structured list of tags. End to end works.

### Notes

- This is the hardest phase to get right because all the plumbing decisions get baked in. Take time on `server.ts` and `error-translation.ts` — copy-paste from these into every subsequent tool.
- The conformance test pays back enormously. Don't skip it.

---

## Phase 3 — Build out the remaining tools

**Status:** not started
**Target:** 2–3 days
**Goal:** All 12 tools implemented and tested.

### Tasks (in implementation order, easy → hard)

- [ ] `list_agents` — simple wrap, paginated
- [ ] `list_scenarios` — simple wrap, paginated, filterable by status
- [ ] `list_recent_runs` — simple wrap, multiple filter dimensions
- [ ] `get_run_details` — fetch run + evaluation if available, return curated combined view
- [ ] `get_usage_summary` — aggregate `/usage/events` client-side into per-agent/per-scenario totals
- [ ] `preview_run_cost` — simple wrap of credit-preview endpoint
- [ ] `delete_agent` — include explicit confirmation in description ("permanently deletes...")
- [ ] `delete_scenario` — note 409 if runs still reference it; surface as `suggested_fix`
- [ ] `register_agent` — chains `agents.testAgentCard` then `agents.create`; if card test fails, don't create
- [ ] `generate_scenario` — first blocking async tool; polls job, returns final scenario or structured FAILED error
- [ ] `evaluate_agent` — the boss tool. Pipeline: `creditPreview` → `simulate` → `pollRun` → `pollEval` → `getEvaluation`. Returns `{ simulation_uuid, evaluation: {...curated...}, credits_used }`

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

**Status:** not started
**Target:** 2 days
**Goal:** Production-grade quality.

### Tasks

- [ ] Rate-limit handling: respect 429s, exponential backoff up to 3 retries, surface as `RateLimitError` with `retry_after`
- [ ] Timeout handling: every tool has a sensible deadline, partial results returned when possible
- [ ] Robust error translation: every error pattern in `docs/verifyax-api.md` async-failures table is mapped
- [ ] Tool description optimization pass: test each description with ambiguous user prompts, refine until Claude picks correctly
- [ ] Edge cases: empty workspace (no agents, no scenarios), deleted resource mid-poll, malformed responses, server unreachable
- [ ] CI runs integration tests on `main` and on release tags
- [ ] Top-level README: project overview, installation, usage examples, troubleshooting
- [ ] CONTRIBUTING.md with development setup and PR guidelines
- [ ] `docs/tool-descriptions.md` finalized, with rationale for non-obvious wording choices

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
