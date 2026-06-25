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

// List the skill-tag catalogue (no auth; served from the web route).
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
  webBaseUrl: 'https://console.verifyax.com/web/api/v1', // override the tag-catalogue base
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

| Accessor             | Methods                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `client.agents`      | `create`, `list`, `get`, `update`, `delete`, `testAgentCard`, `testApiAgent`, `testApiAgentCurl`                   |
| `client.scenarios`   | `generate`, `list`, `get`, `update`, `delete`, `getJob`                                                            |
| `client.simulations` | `creditPreview`, `simulate`, `get`, `list`, `cancel`, `delete`, `triggerEvaluation`, `getEvaluation`, `waitForRun` |
| `client.jobs`        | `list`, `get`, `cancel`, `retry`, `delete`, `pollUntilTerminal`                                                    |
| `client.tags`        | `list`                                                                                                             |
| `client.usage`       | `listEvents`, `getEvent`, `listCalls`                                                                              |

## License

Apache-2.0.
