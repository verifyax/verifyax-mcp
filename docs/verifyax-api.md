---
name: verifyax-api
description: Drive the VerifyAX agent evaluation platform programmatically through its REST API — register AI agents (A2A or REST), generate test scenarios with skill tags, trigger simulation runs against them, poll async jobs, and fetch evaluation results. Use this skill whenever the user mentions VerifyAX, the verifyax.com console, or wants to evaluate, benchmark, simulate, or test an AI agent against scenarios via API — even if they don't explicitly say "VerifyAX API". Also use when the user references endpoints under console.verifyax.com, asks how to script agent evals, wants to chain register-agent → run-simulation → fetch-results, or needs help interpreting VerifyAX job statuses, scenario tags, or credit estimates.
---

# VerifyAX API Skill

Use this skill to interact with the VerifyAX platform API programmatically — register agents, create scenarios, trigger simulation runs, poll jobs, and fetch evaluation results.

## Base URL & Authentication

All requests go to `https://console.verifyax.com/api/v1`. Every request needs a Bearer token:

```
Authorization: Bearer <api-key>
Content-Type: application/json   (POST/PUT/PATCH with a body)
```

The API key encodes tenant context — never send `organization_uuid`, `workspace_uuid`, or `user_uuid` on requests; the gateway injects them from your key. Get keys from **Settings > API Keys** in the platform.

## Core Concepts

- **Agent** — registered AI endpoint (A2A or REST). Workspace-scoped.
- **Scenario** — test environment (multi-agent `info_exchange` or 1-to-1 `interview`). Tagged with skill tags.
- **Simulation run** — single execution of an agent against a scenario. Produces a transcript.
- **Evaluation** — scores a completed run against scenario ground truth.
- **Job** — async handle for long-running operations (scenario creation, simulation, evaluation). Lifecycle: `PENDING → PROCESSING → COMPLETED | FAILED | CANCELLED`.

Pipeline: Register Agent → Create Scenario → Trigger Simulation → Evaluate → Fetch Results.

## Conventions

- All resource IDs are in the `uuid` field of response objects. Path params use a prefixed name (e.g. `{scenario_uuid}`, `{agent_uuid}`) — supply the `uuid` value from the corresponding response.
- Timestamps are ISO 8601 UTC with trailing `Z`.
- Status enums are **UPPERCASE**: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- List endpoints return plain arrays (no envelope). Paginate with `limit` (default 100, max 1000) and `offset`.
- Filters combine with AND. Omit a param to leave that dimension unfiltered.
- Error shape: `{ "error": "...", "message": "...", "statusCode": N }`.

## Agents

### Register an agent
```
POST /v1/agents
{
  "name": "string (required, workspace-unique)",
  "description": "string",
  "agent_url": "https://...",
  "agent_type": "A2A | API",          // default A2A
  "agent_parameters": {
    "auth_method": "no-auth | bearer | cs | http-basic",
    "token": "string (min 10 chars, used by bearer/cs)",
    "basic_username": "string",
    "basic_password": "string",
    "include_full_context": "always | never | first_only",
    "include_message_history": false,
    "max_requests_per_minute": 4,
    "timeout": 15000,                 // ms, min 500
    "agent_card_url": "https://...",  // A2A card override
    "agent_card_path": "/.well-known/agent-card.json"
  }
}
// Returns: agent object with uuid
```

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
{ "url": "...", "method": "GET", "headers": {}, "timeout": 10 }

POST /v1/agents/tests/api-agent-test-curl // parse + execute a cURL command
{ "curl_command": "curl -X GET '...'", "timeout": 10 }
```

## Scenarios

### Generate a scenario (async)
```
POST /v1/scenarios/generate
{
  "name": "string (required, workspace-unique)",
  "scenario_type": "info_exchange | interview",
  "context_prompt": "string",
  "tags": ["tag1", "tag2"],             // tag `name` from GET /web/api/v1/tags; max 5 info_exchange / 2 interview
  "timeout_minutes": 30,
  "num_scenarios": 1,                   // >1 enables batch mode
  // batch-only fields:
  "tag_pool": ["tag1", ...],
  "include_tags": ["tag1"],
  "total_tags": 3,
  "max_tags_per_npc": 1
}
// Returns: { uuid (scenario id), job_uuid, batch_uuid, batch_scenario_uuids (batch mode only), ... }
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
  "evaluate_on_complete": true,    // auto-queue evaluation when run finishes
  "num_runs": 1                    // parallel repetitions for robustness
}
// Returns: { job_uuid, simulation_uuid, simulation_uuids, evaluation_job_uuid, status }
// When num_runs > 1 all UUIDs are in simulation_uuids, grouped by run_group_uuid.
```

### Estimate credits before triggering
```
POST /v1/engine/workspace-credit-preview
{
  "mode": "scenario_run",
  "scenario_uuid": "...",
  "num_runs": 1,
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
// evaluation_job_uuid is on the run record after evaluation is queued
```

### Poll pattern (Python)
```python
import requests, time

BASE = "https://<gateway>/api/v1"
H = {"Authorization": "Bearer <key>"}

resp = requests.post(f"{BASE}/engine/simulate/scenario", headers={**H, "Content-Type": "application/json"},
    json={"scenario_uuid": SCENARIO_UUID, "agent_uuid": AGENT_UUID, "evaluate_on_complete": True})
resp.raise_for_status()
run_uuid = resp.json()["simulation_uuid"]

while True:
    r = requests.get(f"{BASE}/simulations/{run_uuid}", headers=H, timeout=30)
    r.raise_for_status()
    status = r.json().get("status", "").upper()
    if status == "COMPLETED": break
    if status in ("FAILED", "CANCELLED"): raise RuntimeError(f"Run {status}")
    time.sleep(15)
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
  ?product_area=scenario_run
  &simulation_uuid=...
  &job_uuid=...
  &scenario_uuid=...
  &failed=false
  &event_start_from=2026-01-01T00:00:00Z
  &event_start_to=2026-12-31T23:59:59Z
  &limit=100&offset=0

GET /v1/usage/events/{event_id}

GET /v1/usage/calls
  ?event_uuid=...
  &provider_name=anthropic
  &model_name=claude-3-5-haiku-20241022
  &limit=100&offset=0
```

Drill path: filter events by `simulation_uuid` → get `event_uuid` → list calls with `event_uuid` for per-model token detail.

## Auth — One-time Login Token

Mint a single-use browser-session link for a human operator from a backend job:

```
POST /v1/auth/one-time-login-token
// Returns: { token, example_links: { home, workbench } }
// Token is short-lived, single-use, passed in URL fragment (not query string).
```

## Skill Tags

Skill tags are **not** on the public `/api/v1` surface. Discover them via the gateway **web** route (same host, different base path):

```
GET https://console.verifyax.com/web/api/v1/tags
// Global catalogue — no auth required.

GET https://console.verifyax.com/web/api/v1/tags?organizationId=<org_uuid>
// Global + org-specific overlay — requires browser session auth (not API key).
```

**Response shape** (wrapper, not a bare array):

```json
{
  "success": true,
  "data": [
    {
      "name": "empathy",
      "category": "social",
      "description": "...",
      "benchmark_family": null,
      "allowed_scenario_types": ["info_exchange", "interview"]
    }
  ]
}
```

**Each tag object:**

| Field | Meaning |
|-------|---------|
| `name` | Canonical id — pass this string in `tags` / `tag_pool` on generate |
| `category` | Grouping label |
| `description` | What capability the tag measures |
| `benchmark_family` | `"agentharm"`, `"gaia"`, `"qna"`, etc., or `null` for normal tags |
| `allowed_scenario_types` | Which `scenario_type` values may use this tag: `info_exchange`, `interview`, both, or `[]` (not selectable) |
| `client_specific` | `true` when the tag comes from an org overlay (only with `organizationId` query) |

**Tag selection checklist (do this before `POST /v1/scenarios/generate`):**

1. `GET /web/api/v1/tags` → read `data`.
2. Filter tags where `allowed_scenario_types` includes your chosen `scenario_type`. When the field is omitted, treat as both types allowed (UI backward compat).
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
3. **Discover tags** — `GET /web/api/v1/tags` → filter by `allowed_scenario_types` for your `scenario_type`
4. **Generate scenario** — `POST /v1/scenarios/generate` → store `uuid` (use as `{scenario_uuid}` in paths) + `job_uuid`
5. **Wait for scenario** — poll `GET /v1/jobs/{job_uuid}` until `COMPLETED` (if `FAILED`, fix tags and retry)
6. **Estimate cost** — `POST /v1/engine/workspace-credit-preview`
7. **Trigger run** — `POST /v1/engine/simulate/scenario` with `evaluate_on_complete: true` → store `simulation_uuid`
8. **Poll run** — `GET /v1/simulations/{simulation_uuid}` every 15s until `COMPLETED`
9. **Fetch evaluation** — `GET /v1/simulations/evaluations/{evaluation_job_uuid}`
10. **Track spend** — `GET /v1/usage/events?simulation_uuid=...`

## Common Errors

| Code | Meaning |
|------|---------|
| 401  | Missing, malformed, or revoked API key |
| 403  | Key valid but resource belongs to another workspace |
| 404  | Resource not found |
| 409  | Conflict — e.g. deleting a scenario that still has runs |
| 429  | Rate limited — use exponential backoff |
| 500  | Internal server error |

### Async scenario_creation failures (201 then FAILED job)

| `error_details` pattern | Likely cause | Fix |
|-------------------------|--------------|-----|
| `tags do not exist in the skill tags registry` | Unknown `name` | Re-fetch `GET /web/api/v1/tags`; use exact `name` values |
| `does not support … benchmark tags` | Benchmark tag with wrong `scenario_type` | Use `info_exchange`, or pick non-benchmark tags |
| `QnA tags are only supported for 'interview'` | QnA tag with `info_exchange` | Switch to `interview` or remove QnA tag |
| mentions `--list-tags` | Worker leaked CLI wording | Ignore CLI; use tag catalogue endpoint |
