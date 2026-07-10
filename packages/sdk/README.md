# @verifyax/sdk

Typed TypeScript client for the [VerifyAX](https://verifyax.com) agent-evaluation REST API —
register agents, generate scenarios, run simulations, poll async jobs, and fetch evaluations.

Resource-oriented, like `stripe-node`: `client.agents.create(...)`,
`client.scenarios.generate(...)`, `client.simulations.simulate(...)`.

## Install

```bash
npm install @verifyax/sdk
# or: pnpm add @verifyax/sdk
```

Requires Node ≥ 20 (uses the global `fetch`).

## Quick start

```ts
import { VerifyaxClient } from '@verifyax/sdk';

const client = new VerifyaxClient({ apiKey: process.env.VERIFYAX_API_KEY! });

// List the skill-tag catalogue (authed; merges the global catalogue with your org overlay).
const tags = await client.tags.list();

// Register an A2A agent.
const agent = await client.agents.create({
  name: 'my-agent',
  agent_type: 'A2A',
  agent_url: 'https://my-agent.example.com/.well-known/agent-card.json',
});
```

## Full pipeline

```ts
import { VerifyaxClient } from '@verifyax/sdk';

const client = new VerifyaxClient({ apiKey: process.env.VERIFYAX_API_KEY! });

// 1. Generate a scenario (async) and wait for the job to finish.
const gen = await client.scenarios.generate({
  name: 'demo-scenario',
  scenario_type: 'interview',
  tags: ['active_listening'],
});
await client.jobs.pollUntilTerminal(gen.job_uuid);

// 2. Preview cost, then run the agent against the scenario with auto-evaluation.
await client.simulations.creditPreview({
  mode: 'scenario_run',
  scenario_uuid: gen.uuid,
  agent_uuid: agent.uuid,
});
const sim = await client.simulations.simulate({
  scenario_uuid: gen.uuid,
  agent_uuid: agent.uuid,
  evaluate_on_complete: true,
});

// 3. Wait for the run, then fetch the evaluation.
const run = await client.simulations.waitForRun(sim.simulation_uuid);
const evaluation = await client.simulations.getEvaluation(
  sim.evaluation_job_uuid ?? run.evaluation_job_uuid!
);
```

> IDs always come back in the `uuid` field of a response. Path parameters use prefixed names
> (`{scenario_uuid}`, `{agent_uuid}`), but you supply the `uuid` value.

## Configuration

```ts
new VerifyaxClient({
  apiKey: '...', // required
  baseUrl: 'https://console.verifyax.com/api/v1', // override the API base
  timeoutMs: 30_000, // per-request timeout
  fetch: customFetch, // inject a fetch implementation (tests)
});
```

## Error handling

Every failure is a typed subclass of `VerifyaxError` — branch on the type instead of parsing
messages:

```ts
import {
  VerifyaxError,
  AuthError, // 401 / 403
  NotFoundError, // 404
  ConflictError, // 409 (e.g. deleting a scenario with runs)
  RateLimitError, // 429 — carries `retryAfter`
  JobFailedError, // a job/run ended FAILED or CANCELLED — carries `errorDetails`
  TimeoutError, // a request or poll exceeded its deadline
} from '@verifyax/sdk';

try {
  await client.jobs.pollUntilTerminal(jobUuid);
} catch (err) {
  if (err instanceof JobFailedError) {
    console.error('Generation failed:', err.errorDetails);
  } else if (err instanceof RateLimitError) {
    console.error('Backing off for', err.retryAfter, 'seconds');
  } else {
    throw err;
  }
}
```

## Polling

`client.jobs.pollUntilTerminal(jobUuid, opts)` polls a job until `COMPLETED`, throwing
`JobFailedError` on `FAILED`/`CANCELLED` and `TimeoutError` past the deadline.
`client.simulations.waitForRun(simulationUuid, opts)` does the same for a simulation run.
Both accept `{ timeoutMs, intervalMs, signal }`.

## Resources

| Accessor             | Methods                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.agents`      | `create`, `list`, `get`, `update`, `delete`, `testAgentCard`, `testA2aConnection`, `testA2aMessage`, `testMcpConnection`, `testApiAgent`, `testApiAgentCurl`, `testApiAgentDirectline`                                        |
| `client.scenarios`   | `generate`, `generateFromQna`, `list`, `get`, `update`, `delete`, `getJob`                                                                                                                                                    |
| `client.simulations` | `creditPreview`, `simulate`, `get`, `list`, `listForScenario`, `cancel`, `delete`, `triggerEvaluation`, `getEvaluation`, `getEvaluationReport`, `getEvaluationScores`, `getScores`, `getOutput`, `downloadFile`, `waitForRun` |
| `client.jobs`        | `list`, `get`, `cancel`, `retry`, `delete`, `pollUntilTerminal`                                                                                                                                                               |
| `client.tags`        | `list`, `registerQna`                                                                                                                                                                                                         |
| `client.usage`       | `getBalance`, `listEvents`, `getEvent`, `listCalls`                                                                                                                                                                           |
| `client.logs`        | `list`                                                                                                                                                                                                                        |

## Types & the OpenAPI spec

Response schemas in [`src/types.gen.ts`](src/types.gen.ts) are **generated** from a mirror of the
canonical VerifyAX OpenAPI spec ([`openapi/verifyax.yaml`](openapi/verifyax.yaml)) — the spec is the
single source of truth. Don't hand-edit either file. To refresh both from
`console.verifyax.com/openapi.yaml`:

```bash
pnpm sync:spec     # fetch the spec into the mirror, then regenerate types
# or, if the mirror is already current:
pnpm gen:types
```

CI fails if the committed `types.gen.ts` drifts from the mirror. The hand-written `types.ts` (request
shapes and the resource-facing types) is being migrated onto these generated schemas incrementally.

## License

Apache-2.0.
