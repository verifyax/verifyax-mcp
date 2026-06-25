# CLAUDE.md

Persistent project context for Claude Code. Read this first in every session.

## What we're building

A Model Context Protocol (MCP) server that exposes the VerifyAX agent-evaluation platform as conversational tools, distributed as an npm package. Plus the typed SDK it sits on top of.

Two packages in one monorepo:

- **`@verifyax/sdk`** — typed TypeScript client for the VerifyAX REST API. Reusable by any consumer, not MCP-specific.
- **`@verifyax/mcp-server`** — MCP server exposing ~12 tools mapped to user intents. Depends on the SDK.

The MCP server complements (does not replace) the existing `verifyax-api` skill at `https://github.com/verifyax/claude-plugins`. The skill is for developers writing code; the MCP server is for conversational workflows.

## v1 scope and constraints

- **Local distribution only.** Users install via npm and configure the server in their MCP client (Claude Code, Claude Desktop). Remote hosting is v2.
- **API key auth.** User pastes their VerifyAX key into MCP client config as `VERIFYAX_API_KEY`. OAuth is v2.
- **Blocking-by-default tools.** Async polling lives inside the server, invisible to Claude and the user. No `start_job` / `get_status` pairs in v1.
- **Structured errors over exceptions.** Tools return `{ success: false, reason, suggested_fix }` instead of throwing where possible.
- **Twelve tools.** Resist the urge to wrap every endpoint. See the catalogue below.

## Architecture decisions (already made — do not re-litigate)

1. **Language: TypeScript.** Faster-moving MCP ecosystem, better tool descriptions support.
2. **Package manager: pnpm** with workspaces.
3. **SDK and MCP server are separate packages**, published under the `@verifyax` npm scope.
4. **API client style: resource-oriented**, like `stripe-node`. `client.agents.create(...)`, `client.scenarios.generate(...)`, `client.simulations.evaluate(...)`.
5. **Error handling: typed error hierarchy.** `VerifyaxError` base; `AuthError`, `NotFoundError`, `ConflictError`, `JobFailedError`, `TimeoutError`, `RateLimitError` derived.
6. **MCP tool errors: structured.** SDK throws; the tool handler catches and translates to MCP tool-result `{ success: false, ... }` payloads. Never let raw exceptions escape into MCP output.
7. **Polling: in-SDK helper.** `client.jobs.pollUntilTerminal(jobUuid, { timeoutMs, intervalMs })`. Used by both SDK consumers and the MCP server.
8. **Logging: stderr only**, structured JSON, controlled by `VERIFYAX_MCP_LOG_LEVEL` env. stdout is reserved for MCP protocol.
9. **No telemetry in v1.** Document this explicitly in the README.

## VerifyAX API reference

The canonical reference is at `docs/verifyax-api.md` (a copy of the skill's SKILL.md). Trust it for endpoint paths, request shapes, response shapes, status enums, and async semantics.

**If the live API contradicts the doc, fix the doc and add a test that asserts the live behavior.** We've already done one round of skill-vs-reality reconciliation; expect more.

Critical things the API does that are easy to miss:

- All resource IDs come back in the `uuid` field of responses, not in prefixed fields like `scenario_uuid`. Path params use the prefixed names, but you supply the `uuid` value.
- Tag catalogue is on the `/web/api/v1/` base (not `/api/v1/`) and returns `{ success, data: [...] }`, not a bare array — different from every other list endpoint.
- Tags have an `allowed_scenario_types` field. Scenario generation **does not** validate this at request time — it returns 201 then the job fails. Filter tags client-side.
- Benchmark tags (`benchmark_family` set, except `"qna"`) are `info_exchange`-only. QnA tags are `interview`-only and must be the sole tag.
- Status enums are UPPERCASE: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`. Simulation runs additionally use `CREATED`, `IN_PROGRESS`.
- Never send `organization_uuid`, `workspace_uuid`, or `user_uuid` on requests — the gateway injects them from the API key.

## Tool catalogue (v1)

The MCP server exposes exactly these tools. Each tool description should be short, intent-focused, and optimized for Claude's tool selection — not a description of the underlying endpoint.

| Tool | Maps to | Blocking? |
|---|---|---|
| `list_compatible_tags` | `GET /web/api/v1/tags` + client-side filter | No |
| `register_agent` | `POST /agents/tests/agent-card` + `POST /agents` | No |
| `list_agents` | `GET /agents` | No |
| `delete_agent` | `DELETE /agents/{uuid}` | No |
| `generate_scenario` | `POST /scenarios/generate` + poll job | **Yes** |
| `list_scenarios` | `GET /scenarios` | No |
| `delete_scenario` | `DELETE /scenarios/{uuid}` | No |
| `evaluate_agent` | `POST /engine/workspace-credit-preview` + `POST /engine/simulate/scenario` + poll run + poll eval + `GET /simulations/evaluations/{eval_job}` | **Yes** |
| `list_recent_runs` | `GET /simulations` | No |
| `get_run_details` | `GET /simulations/{uuid}` + transcript + evaluation if available | No |
| `get_usage_summary` | `GET /usage/events` aggregated client-side | No |
| `preview_run_cost` | `POST /engine/workspace-credit-preview` | No |

**Omitted intentionally.** Raw job-status access. Per-call usage drill-down. Scenario artifact editing. One-time-login-token. These are power-user features that bloat the v1 tool list. Add to v2 only if users ask.

## Repository layout

```
verifyax-mcp/
├── CLAUDE.md                          ← this file
├── PLAN.md                            ← phased execution plan
├── README.md
├── LICENSE                            ← Apache-2.0
├── package.json                       ← workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .github/workflows/
│   ├── ci.yml
│   └── publish.yml
├── docs/
│   ├── verifyax-api.md                ← API reference (copy of skill)
│   └── tool-descriptions.md           ← optimized descriptions, reviewed
├── packages/
│   ├── sdk/
│   │   ├── package.json               ← @verifyax/sdk
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── errors.ts
│   │   │   ├── polling.ts
│   │   │   ├── types.ts               ← shared response types
│   │   │   ├── resources/
│   │   │   │   ├── agents.ts
│   │   │   │   ├── scenarios.ts
│   │   │   │   ├── simulations.ts
│   │   │   │   ├── jobs.ts
│   │   │   │   ├── tags.ts
│   │   │   │   └── usage.ts
│   │   │   └── index.ts
│   │   └── test/
│   │       ├── unit/                  ← msw or nock
│   │       └── integration/           ← real API, gated on VERIFYAX_TEST_KEY
│   └── mcp-server/
│       ├── package.json               ← @verifyax/mcp-server
│       ├── src/
│       │   ├── server.ts              ← MCP boilerplate
│       │   ├── auth.ts                ← reads VERIFYAX_API_KEY
│       │   ├── error-translation.ts
│       │   ├── logging.ts
│       │   ├── tools/
│       │   │   ├── list-compatible-tags.ts
│       │   │   ├── register-agent.ts
│       │   │   ├── ...one file per tool...
│       │   │   └── index.ts           ← registers all tools
│       │   └── index.ts               ← CLI entry, exposes `verifyax-mcp-server` bin
│       └── test/
│           ├── unit/
│           └── integration/
```

One file per tool. Don't combine related tools. Each file: schema, description, handler, error translation. Easy to find, easy to review.

## Coding conventions

- **TypeScript strict mode.** No `any`, no `as unknown as`. If a type assertion is needed, it gets a comment explaining why.
- **No default exports.** Named exports only. Easier to refactor and grep.
- **No barrel re-exports across package boundaries.** Each tool file exports its handler; the registry imports them explicitly.
- **Async/await everywhere.** No raw promise chains.
- **Errors must be typed.** Never throw a plain `Error` from inside the SDK or server. Use the typed hierarchy.
- **Tests colocate by intent, not file structure.** A test for `register_agent` lives in `test/unit/register-agent.test.ts`, not nested under `tools/`.
- **No `console.log` anywhere.** Use `logging.ts` which writes to stderr.
- **Prettier + ESLint** with the standard configs. No bikeshedding on formatting.

## Tool description rules

These are read by Claude to decide when to call a tool. They matter as much as the code.

- **One sentence, present tense, action verb first.** "Register an AI agent..." not "This tool registers..."
- **Mention the key inputs in the description.** "Register an agent given its name, URL, and auth method." Helps Claude pick correctly when the user description is sparse.
- **Mention what it returns.** "Returns the new agent's uuid and connectivity test result."
- **For blocking tools, say so explicitly.** "Blocks until evaluation completes (typically 30s–5min)." Sets Claude's expectations and avoids it calling the tool repeatedly.
- **Never reference HTTP, REST, endpoints, or the underlying API.** The whole point is that Claude doesn't know or care about those.
- **Iterate.** First-draft descriptions are usually wrong. After Phase 3, test each one with deliberately ambiguous user prompts and see if Claude picks the right tool. Adjust until it does.

Final descriptions live in `docs/tool-descriptions.md` for review and version-controlled diffs.

## Testing strategy

Three layers:

1. **Unit tests** — mock the SDK's HTTP layer with `msw`. Fast, run on every commit. Cover happy path, error path, and edge cases per tool.
2. **Integration tests** — real API calls against a dedicated test workspace. Gated on `VERIFYAX_TEST_KEY` env. Run in CI on `main` and on release tags. Slow but catch drift between our types and the live API.
3. **MCP conformance test** — spawn the server as a subprocess, send MCP protocol messages, assert responses. Catches protocol-level bugs the unit tests miss.

Integration tests should clean up after themselves (delete created agents/scenarios). Use a deterministic prefix like `mcp-test-{uuid}` for resource names so cleanup is trivial.

## What good output from Claude Code looks like

When I (the human) prompt Claude Code with a task, I expect:

- **A diff small enough to review in 5 minutes.** If the task is bigger, decompose it before starting.
- **Tests alongside implementation.** No "I'll add tests later." Tests come with the code.
- **Working code, then refinement.** Don't over-engineer on the first pass. Get the happy path green, then handle errors, then optimize descriptions.
- **Honest reporting.** If the task isn't fully done, say so. If a decision was made that wasn't covered by this doc, flag it explicitly. Don't hide tradeoffs.
- **No silent changes to architecture decisions.** If you think a decision in this CLAUDE.md is wrong, raise it in the response — don't just deviate.

## Things that are out of scope for v1 (do not build, even if tempted)

- Remote MCP server hosting.
- OAuth or any auth flow beyond reading `VERIFYAX_API_KEY` from env.
- A second SDK in Python or any other language.
- A web UI for managing the server.
- Telemetry, analytics, or usage reporting.
- Caching of API responses.
- Streaming tool outputs.
- Tools beyond the twelve listed above.
- Custom error types beyond the seven defined.

If a user asks for any of these, write it down in `docs/v2-backlog.md` and move on.

## Operational notes

- **Versioning.** Both packages follow semver. Bump in lockstep for v1.x. Independent versioning is a v2 concern.
- **Publishing.** Manual via `pnpm publish` until release volume justifies CI publishing. Tag releases as `vX.Y.Z` on the repo.
- **Release notes.** Every release gets a `CHANGELOG.md` entry. Format: Keep a Changelog.
- **The skill stays the canonical API reference.** When the API changes, update `docs/verifyax-api.md` first (and the skill in the `claude-plugins` repo), then update the SDK, then the MCP server.

## Quick context for new Claude Code sessions

If you're reading this fresh: we have a working API skill in production at `verifyax/claude-plugins`. It teaches Claude how to drive the VerifyAX API via Python scripts. This repo is the next layer — turning that same capability into native MCP tools so Claude can execute the workflow directly instead of writing scripts for the user to run.

The skill is at `docs/verifyax-api.md` in this repo. Read it before writing any API-touching code.

Current phase: see `PLAN.md`.
