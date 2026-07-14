# Tool descriptions

These are the descriptions Claude reads to decide when to call each tool. They follow the rules
in `CLAUDE.md` (action verb first, name the key inputs, say what it returns, flag blocking tools,
never mention HTTP/REST/endpoints) and are the source of truth — keep the strings in the tool
files in sync with this file.

Each entry notes the rationale for non-obvious wording.

## list_compatible_tags

> Lists the skill tags that can be used to generate a scenario of a given type (info_exchange or
> interview). Use this before generating a scenario to pick valid tags. Returns each tag’s name,
> category, and description, and flags QnA tags that must be the only tag.

**Rationale.** "Use this before generating a scenario" steers Claude to call it as the first step
of an authoring flow. Calling out QnA's sole-tag rule pre-empts a common async generation failure.

## register_agent

> Registers an AI agent in VerifyAX given its name, connector type (A2A, API, DIRECTLINE for
> Copilot Studio, or MCP), URL, and optional auth or connector settings. For A2A agents it first
> verifies the agent card is reachable; DIRECTLINE and MCP agents are probed before creation.
> Returns the new agent’s uuid and whether connectivity was checked.

**Rationale.** Naming the inputs (name, URL, type, auth/connectors) helps Claude map a sparse user
request. Stating the pre-create connectivity check sets the expectation that a failure means
"nothing was created", so Claude won't assume a partial state.

## list_agents

> Lists the AI agents registered in your VerifyAX workspace, optionally filtered by connector type
> (A2A, API, DIRECTLINE, EXTENSION, or MCP). Returns each agent’s uuid, name, type, and URL.

## delete_agent

> Permanently deletes an agent from your VerifyAX workspace by its uuid. This cannot be undone.
> Returns confirmation of the deletion.

**Rationale.** "Permanently … cannot be undone" is deliberate — it nudges Claude to confirm intent
with the user before calling. Also carries the `destructiveHint` annotation.

## generate_scenario

> Generates a new test scenario of a given type (info_exchange or interview) with optional skill
> tags and context, then blocks until generation finishes (typically 30s–2min). Set num_scenarios
> greater than 1 for batch mode (requires tag_pool). Returns the new scenario’s uuid, or batch
> uuids when batching, or a structured error with details if generation fails (e.g. incompatible tags).

**Rationale.** "Blocks until … finishes (typically 30s–2min)" stops Claude from polling or
re-calling. Mentioning incompatible-tag failure points Claude back to `list_compatible_tags`.

## list_scenarios

> Lists the test scenarios in your VerifyAX workspace, optionally filtered by type (info_exchange
> or interview) and status. Returns each scenario’s uuid, name, type, and status.

## delete_scenario

> Permanently deletes a scenario from your VerifyAX workspace by its uuid. This cannot be undone
> and fails if simulation runs still reference the scenario. Returns confirmation of the deletion.

**Rationale.** The "fails if runs still reference it" clause explains the likely conflict error in
advance, so Claude can suggest deleting the runs first.

## evaluate_agent

> Runs an agent against a scenario and evaluates the result end to end, blocking until the
> evaluation completes (typically 30s–5min). Give it an agent uuid and a scenario uuid; it previews
> cost, runs the simulation, waits for it, and returns the evaluation scores. Optional
> timeout_minutes (1–240) overrides the scenario default for this run.

**Rationale.** This is the marquee tool. "end to end" + the explicit step list ("previews cost,
runs … waits … returns scores") tells Claude one call does the whole pipeline — so it won't try to
orchestrate simulate/evaluate separately. The blocking note manages latency expectations.

## list_recent_runs

> Lists recent simulation runs in your VerifyAX workspace, optionally filtered by status, agent,
> scenario, date range, search text, or run group. Returns each run’s uuid, status, agent,
> scenario, and evaluation handle.

## get_run_details

> Fetches the full details of a single simulation run by its uuid, including its status and the
> evaluation results when they are available. Use after a run to inspect scores and outcome.

**Rationale.** "when they are available" sets the expectation that evaluation may be absent for an
in-progress run, so a null evaluation isn't read as an error.

## get_usage_summary

> Summarizes VerifyAX usage events over an optional time range or for a specific simulation,
> scenario, or job. Returns the total event count, a breakdown by product area, and total platform
> spend in USD when reported.

## preview_run_cost

> Estimates the credit cost of running an agent against a scenario before triggering it. Returns the
> estimated credits, your current balance, and any pending committed spend. Optional timeout_minutes
> (1–240) affects the run-cost estimate.

**Rationale.** "before triggering it" positions this as the cheap pre-check ahead of
`evaluate_agent`, so Claude can answer "how much will this cost?" without starting a run.
