---
name: verifyax-api
description: Drive the VerifyAX agent evaluation platform programmatically through its REST API — register AI agents (A2A or REST), generate test scenarios with skill tags, trigger simulation runs against them, poll async jobs, and fetch evaluation results. Use this skill whenever the user mentions VerifyAX, the verifyax.com console, or wants to evaluate, benchmark, simulate, or test an AI agent against scenarios via API — even if they don't explicitly say "VerifyAX API". Also use when the user references endpoints under console.verifyax.com, asks how to script agent evals, wants to chain register-agent → run-simulation → fetch-results, or needs help interpreting VerifyAX job statuses, scenario tags, or credit estimates.
---

# VerifyAX API Skill

Use this skill to interact with the VerifyAX platform API programmatically — register agents, create scenarios, trigger simulation runs, poll jobs, and fetch evaluation results.

> Mirrors the canonical SKILL.md in the verifyax-plugins repo. When the live API changes, update this file first, then the SDK, then the MCP server.

## Base URL & Authentication

All public endpoints live under the gateway `/api/v1` prefix (e.g. `https://console.verifyax.com/api/v1`; on other deployments use that origin's `/api/v1`). Every request needs a Bearer token:

```
Authorization: Bearer <api-key>           // keys look like sk-ver-api-...
Content-Type: application/json            // required on POST/PUT/PATCH with a body
X-Request-Id: <client-correlation-id>     // optional; accepted but not echoed or forwarded
```

The API key encodes tenant context — never send `organization_uuid`, `workspace_uuid`, or `user_uuid` on requests; the gateway injects them from your key and ignores/overwrites any client-supplied values. To target a different workspace, authenticate with a different key. Get keys from **Settings > API Keys** (workspace Editor/Admin can create; Admin can revoke). The full secret is shown only once at creation — it cannot be re-fetched.

## Core Concepts

- **Agent** — registered AI endpoint (A2A or REST). Workspace-scoped.
- **Scenario** — test environment (multi-agent `info_exchange` or 1-to-1 `interview`). Tagged with skill tags.
- **Simulation run** — single execution of an agent against a scenario. Produces a transcript.
- **Evaluation** — scores a completed run against scenario ground truth.
- **Job** — async handle for long-running operations (scenario creation, simulation, evaluation). Lifecycle: `PENDING → PROCESSING → COMPLETED | FAILED | CANCELLED`.

Pipeline: Register Agent → Create Scenario → Trigger Simulation → Evaluate → Fetch Results.

## Conventions

- All resource IDs are in the `uuid` field of response objects. Path params use a prefixed name (e.g. `{scenario_uuid}`, `{agent_uuid}`) — supply the `uuid` value from the corresponding response.
- Timestamps are ISO 8601 UTC with trailing `Z` (e.g. `2026-04-22T09:05:43Z`). Resources with lifecycle carry `created_at`/`updated_at`.
- Lifecycle status enums are **UPPERCASE** (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`); generation inputs like `scenario_type` are lowercase snake_case. `agent_type` values include `A2A`, `API`, `DIRECTLINE`, `EXTENSION`, `MCP`.
- **Treat enum sets as open and tolerate unknown response fields** — new enum values and new top-level keys ship without a version bump. Handle an unrecognised status as "not yet terminal" rather than asserting the set is closed.
- List endpoints return plain JSON arrays (no envelope). Paginate with `limit` (default 100, max 1000; `1 ≤ limit ≤ 1000`) and `offset`. Ordering is stable within one call but not across calls.
- Filters combine with AND. Omit a param to leave that dimension unfiltered. Unknown keys in request bodies are ignored, not rejected.
- **Error bodies: the HTTP status code is the source of truth — read it from the status line, not the body.** There is **no `statusCode` field** in error bodies except on gateway rate-limit responses. Body shape varies by origin: gateway errors return `message`; gateway proxy/transport failures return `detail`; underlying-API errors usually carry `detail` (sometimes `error` + `message`); rate-limit responses carry `error`, `message`, and `statusCode`. Branch on the status code; for logging, read whichever of `message` / `detail` / `error` is present.

### Rate limiting

Per-workspace limit (default **300 requests/minute**, shared across all keys in the workspace). Every response carries `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` (seconds). A `429` adds `Retry-After` — honor it, otherwise use exponential backoff with jitter and pace polling loops well below the limit.

## Agents

### Register an agent
```
POST /v1/agents
{
  "name": "string (required)",        // if taken, server suffixes it: "My Agent (1)"
  "description": "string",
  "agent_url": "https://...",
  "agent_type": "A2A | API | DIRECTLINE",  // default A2A
  "agent_parameters": {
    "auth_method": "no-auth | bearer | cs | http-basic",   // default no-auth (A2A/API)
    "token": "string (min 10 chars, used by bearer/cs)",
    "basic_username": "string",
    "basic_password": "string",       // platform sends Authorization: Basic base64(user:pass)
    "directline": {                   // DIRECTLINE only — Copilot Studio
      "secret": "<direct-line-secret>",
      "region": "global | europe | india | unitedstates | asia | australia | northamerica"
    },
    "include_full_context": "always | never | first_only", // default never
    "include_message_history": false,
    "max_requests_per_minute": 4,
    "timeout": 15000,                 // ms, min 500
    "default_output_modes": [],       // A2A output modes the agent should produce
    "agent_card_url": "https://...",  // A2A card override
    "agent_card_path": "/.well-known/agent-card.json"
  }
}
// Returns: agent object with uuid
```

A2A agents are reached over JSON-RPC over HTTPS (gRPC and HTTP+JSON A2A transports are not supported); streaming SSE from the agent is consumed internally and surfaced as a single completed turn.

**Copilot Studio (`DIRECTLINE`):** set `agent_url` from region — `global` → `https://directline.botframework.com`, `europe` → `https://europe.directline.botframework.com`, etc. Store the Direct Line secret in `agent_parameters.directline.secret`, not at the top level.

### List agents
```
GET /v1/agents?agent_type=A2A&limit=50&offset=0
```

### Get / update / delete
```
GET    /v1/agents/{agent_uuid}
PATCH  /v1/agents/{agent_uuid}   // send only changed fields
DELETE /v1/agents/{agent_uuid}
```

### Test connectivity (before registering)
```
POST /v1/agents/tests/agent-card          // fetch A2A agent card
{ "agent_url": "...", "agent_type": "A2A", "agent_parameters": {...} }

POST /v1/agents/tests/api-agent-test      // probe REST endpoint
{ "url": "...", "method": "GET", "headers": {}, "body": null, "timeout": 10 }  // timeout in seconds, default 10

POST /v1/agents/tests/api-agent-test-curl // parse + execute a cURL command
{ "curl_command": "curl -X GET '...'", "timeout": 10 }

POST /v1/agents/tests/api-agent-test-directline  // Copilot Studio probe (flat body)
{ "secret": "<direct-line-secret>", "region": "global", "message": "Hello", "timeout": 60 }
// Note: registration nests secret/region under agent_parameters.directline on POST /v1/agents
```

## Scenarios

### Generate a scenario (async)
```
POST /v1/scenarios/generate
{
  "name": "string (required, workspace-unique)",
  "scenario_type": "info_exchange | interview",   // info_exchange is the default
  "context_prompt": "string",
  "tags": ["tag1", "tag2"],             // tag `name` from GET /api/v1/tags; max 5 info_exchange / 2 interview
  "timeout_minutes": 30,                // 1-240
  "num_scenarios": 1,                   // 1-50; >1 enables batch mode (requires batch fields)
  // batch-only fields:
  "tag_pool": ["tag1", ...],            // universe to draw from (each must allow your scenario_type)
  "include_tags": ["tag1"],             // must appear in every scenario; subset of tag_pool
  "total_tags": 3,                      // tags per scenario; same caps as `tags`
  "max_tags_per_npc": 1                 // default 1; ignored for interview
}
// Returns 201 Created: { uuid (scenario id), job_uuid, batch_uuid, batch_scenario_uuids (batch mode only), ... }
// The scenario row exists immediately but scenario.json is written async.
// Poll job_uuid until COMPLETED before running simulations.
```

### List scenarios
```
GET /v1/scenarios?scenario_type=info_exchange&status=SUCCESS&limit=50&offset=0
// Scenario status: INIT | PROCESSING | SUCCESS | FAILED | CANCELLED
```

### Get / update / delete
```
GET    /v1/scenarios/{scenario_uuid}
PATCH  /v1/scenarios/{scenario_uuid}   // { name, description }
DELETE /v1/scenarios/{scenario_uuid}   // 409 if runs still reference it
```

### Copy / re-generate
```
POST /v1/scenarios/{scenario_uuid}/copy?new_name=...     // byte-copy
POST /v1/scenarios/{scenario_uuid}/generate-copy          // replay creation params → new variant
```

### Jobs tied to a scenario
```
GET /v1/scenarios/{scenario_uuid}/job
```

### Artifacts (the materialised scenario.json)
```
GET   /v1/scenarios/{scenario_uuid}/artifacts
PATCH /v1/scenarios/{scenario_uuid}/artifacts   // body = full scenario JSON document
```

### Validate scenario JSON before writing
```
POST /v1/validation/validate
{ "json": "<stringified JSON>", "schema": "scenario" }

GET /v1/validation/schema/scenario   // download the canonical JSON Schema
```

## Simulation Runs

### Trigger a run
```
POST /v1/engine/simulate/scenario
{
  "scenario_uuid": "...",
  "agent_uuid": "...",
  "evaluate_on_complete": true,    // default true; auto-queues evaluation when run finishes
  "num_runs": 1                    // default 1; parallel repetitions for robustness
}
// Returns: { job_uuid, simulation_uuid, evaluation_job_uuid, status ("dispatched"), message, simulation_uuids, run_group_uuid }
// When num_runs > 1 all UUIDs are in simulation_uuids, grouped by run_group_uuid.
// You only send scenario_uuid + agent_uuid; the gateway resolves URL/auth/connector from the registered agent.
```

### Estimate credits before triggering
```
POST /v1/engine/workspace-credit-preview
{
  "mode": "scenario_run",          // required; also "scenario_generation" to preview generation cost
  "scenario_uuid": "...",          // required for scenario_run
  "num_runs": 1,                   // 1-10; multiplies the per-run estimate
  "agent_uuid": "..."              // optional
}
// Returns: { balance, newRunEstimatedCredits, existingRuns, pendingCommittedTotal }
```

### Poll run status
```
GET /v1/simulations/{simulation_uuid}
// status: CREATED | IN_PROGRESS | COMPLETED | FAILED | CANCELLED
// Poll every 15s with backoff until terminal.
```

### List runs
```
GET /v1/simulations?status=COMPLETED&agent_uuid=...&limit=50&offset=0
```

### Cancel / delete a run
```
POST   /v1/simulations/{simulation_uuid}/cancel
DELETE /v1/simulations/{simulation_uuid}   // terminal runs only
```

### Trigger evaluation manually (if not using evaluate_on_complete)
```
POST /v1/engine/evaluate/trigger
{ "simulation_uuid": "..." }
```

### Fetch evaluation results
```
GET /v1/simulations/evaluations/{evaluation_job_uuid}
// evaluation_job_uuid comes from the trigger response, or from the run record's
// evaluation_jobs[] array (take the last entry's uuid / current_status).
// Scores live in the nested `evaluation` object; the exact key depends on the rubric — inspect a real response.
```

### Download run artifacts (transcripts, evidence files, evaluation outputs)
```
GET /v1/simulations/{simulation_uuid}/files?path=files/messages/round_1/1_report.pdf
// `path` is required, relative to the run directory, and MUST start with files/.
// Response is application/octet-stream — write the body to disk, don't parse as JSON.
// 400 if path is missing / traverses / lacks the files/ prefix; 403 wrong workspace; 404 missing run or file.
```

## Jobs

Most async operations return a `job_uuid`. Use the Jobs API to monitor all of them uniformly.

```
GET    /v1/jobs?current_status=PROCESSING&limit=50&offset=0
GET    /v1/jobs/{job_uuid}
POST   /v1/jobs/{job_uuid}/cancel    // while PENDING or PROCESSING
POST   /v1/jobs/{job_uuid}/retry     // when FAILED (eligibility depends on job_type)
DELETE /v1/jobs/{job_uuid}           // terminal states only
```

Job fields: `uuid`, `job_type`, `current_status`, `current_progress_text`, `progress_percentage`, `error_details`, `task_id`, `created_at`, `updated_at`.

## Usage & Spend

```
GET /v1/usage/events
  ?product_area=scenario_run          // also scenario_generation, evaluation, ...
  &simulation_uuid=...
  &job_uuid=...
  &scenario_uuid=...
  &simulation_job_uuid=...
  &evaluation_job_uuid=...
  &failed=false
  &event_start_from=2026-01-01T00:00:00Z
  &event_start_to=2026-12-31T23:59:59Z
  &limit=100&offset=0

GET /v1/usage/events/{event_id}

GET /v1/usage/calls
  ?event_uuid=...
  &provider_name=anthropic
  &model_name=claude-3-5-haiku-20241022
  &call_start_from=2026-01-01T00:00:00Z
  &call_start_to=2026-12-31T23:59:59Z
  &limit=100&offset=0
```

Each event aggregates one or more calls (the underlying LLM/provider calls). Drill path: filter events by `simulation_uuid` → get `event_uuid` → list calls with `event_uuid` for per-model token detail. Use `failed=true` to find runs that consumed credits but didn't deliver.

## Auth — One-time Login Token

Mint a single-use browser-session link for a human operator from a backend job:

```
POST /v1/auth/one-time-login-token
// Returns: { token, example_links: { home, workbench } }
// Token is short-lived, single-use, passed in URL fragment (not query string).
```

## Skill Tags

Discover tags on the public API with your workspace API key:

```
GET https://console.verifyax.com/api/v1/tags
Authorization: Bearer <api-key>
```

Returns a **bare JSON array** — global catalogue merged with your organization's custom overlay. Org-specific tags have `custom: true`; global tags have `custom: false`.

```json
[
  {
    "name": "empathy",
    "category": "social",
    "description": "...",
    "benchmark_family": null,
    "allowed_scenario_types": ["info_exchange", "interview"],
    "custom": false
  }
]
```

**Each tag object:**

| Field | Meaning |
|-------|---------|
| `name` | Canonical id — pass this string in `tags` / `tag_pool` on generate |
| `category` | Grouping label |
| `description` | What capability the tag measures |
| `benchmark_family` | Benchmark family id — a string, an **array** of strings (e.g. `["agentharm", "air_bench"]`), or `null` for normal tags |
| `allowed_scenario_types` | Which `scenario_type` values may use this tag: `info_exchange`, `interview`, both, or `[]` (not selectable) |
| `custom` | `true` when the tag comes from your org overlay |

**Tag selection checklist (do this before `POST /v1/scenarios/generate`):**

1. `GET /api/v1/tags` → read the array.
2. Filter tags where `allowed_scenario_types` includes your chosen `scenario_type`. When the field is omitted, treat as both types allowed.
3. Skip tags with `allowed_scenario_types: []`.
4. Pass each tag's **`name`** (exact string) in `tags` or `tag_pool`.

**Compatibility rules enforced asynchronously** (worker, not on POST — see below):

- Benchmark tags (`benchmark_family` set, except `qna`) → **`info_exchange` only**.
- QnA tags (`benchmark_family: "qna"`) → **`interview` only**, and must be the **sole** tag.
- Unknown tag names → job fails.

`POST /v1/scenarios/generate` validates tag **counts** synchronously but **not** tag existence or scenario-type compatibility. A bad tag choice returns **201 Created** then a **FAILED** `scenario_creation` job. Always poll `GET /v1/jobs/{job_uuid}` and read `error_details`. Worker messages may mention `--list-tags` — that is a **CLI-only** flag; ignore it and re-check the tag catalogue endpoint instead.

## Step-by-Step: Full Workflow

1. **Register agent** — `POST /v1/agents` → store `agent_uuid`
2. **Verify connectivity** — `POST /v1/agents/tests/agent-card` before committing
3. **Discover tags** — `GET /api/v1/tags` → filter by `allowed_scenario_types` for your `scenario_type`
4. **Generate scenario** — `POST /v1/scenarios/generate` → store `uuid` (use as `{scenario_uuid}` in paths) + `job_uuid`
5. **Wait for scenario** — poll `GET /v1/jobs/{job_uuid}` until `COMPLETED` (if `FAILED`, fix tags and retry)
6. **Estimate cost** — `POST /v1/engine/workspace-credit-preview`
7. **Trigger run** — `POST /v1/engine/simulate/scenario` with `evaluate_on_complete: true` → store `simulation_uuid`
8. **Poll run** — `GET /v1/simulations/{simulation_uuid}` every 15s until `COMPLETED`
9. **Fetch evaluation** — `GET /v1/simulations/evaluations/{evaluation_job_uuid}`
10. **Download artifacts** (optional) — `GET /v1/simulations/{simulation_uuid}/files?path=files/...`
11. **Track spend** — `GET /v1/usage/events?simulation_uuid=...`

## Common Errors

| Code | Meaning |
|------|---------|
| 400  | Bad request — check parameters or body |
| 401  | Missing, malformed, or revoked API key |
| 402  | Payment required — insufficient credits for the operation |
| 403  | Key valid but resource belongs to another workspace / insufficient permissions |
| 404  | Resource not found |
| 409  | Conflict — e.g. deleting a scenario that still has runs, or duplicate name |
| 422  | Validation error — body or parameters failed validation |
| 429  | Rate limited — honor `Retry-After`, else exponential backoff |
| 500  | Internal server error |
| 502  | Upstream/billing failure — gateway couldn't get a valid response |

### Async scenario_creation failures (201 then FAILED job)

| `error_details` pattern | Likely cause | Fix |
|-------------------------|--------------|-----|
| `tags do not exist in the skill tags registry` | Unknown `name` | Re-fetch `GET /api/v1/tags`; use exact `name` values |
| `does not support … benchmark tags` | Benchmark tag with wrong `scenario_type` | Use `info_exchange`, or pick non-benchmark tags |
| `QnA tags are only supported for 'interview'` | QnA tag with `info_exchange` | Switch to `interview` or remove QnA tag |
| mentions `--list-tags` | Worker leaked CLI wording | Ignore CLI; use tag catalogue endpoint |
