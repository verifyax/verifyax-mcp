import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { VerifyaxClient } from '../../src/index.js';
import type { ScenarioType } from '../../src/index.js';

// Gated on VERIFYAX_TEST_KEY: without it every test is skipped, so this file is
// safe to run anywhere. The full register -> generate -> simulate -> evaluate
// pipeline additionally needs a reachable A2A agent via VERIFYAX_TEST_AGENT_URL;
// that test self-skips when it is absent.
const API_KEY = process.env.VERIFYAX_TEST_KEY;
const AGENT_URL = process.env.VERIFYAX_TEST_AGENT_URL;
const noKey = !API_KEY;

// Deterministic prefix so leaked resources are easy to spot and clean up.
const PREFIX = `mcp-test-${randomUUID().slice(0, 8)}`;

describe('SDK integration (live API)', () => {
  // 'unset' keeps the constructor from throwing during collection when the
  // suite is skipped; it is never used to make a request in that case.
  const client = new VerifyaxClient({ apiKey: API_KEY ?? 'unset' });
  const createdAgents: string[] = [];
  const createdScenarios: string[] = [];

  afterAll(async () => {
    await Promise.allSettled(createdScenarios.map((uuid) => client.scenarios.delete(uuid)));
    await Promise.allSettled(createdAgents.map((uuid) => client.agents.delete(uuid)));
  });

  it.skipIf(noKey)('lists the tag catalogue', async () => {
    const tags = await client.tags.list();
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);
    expect(typeof tags[0]?.name).toBe('string');
  });

  it.skipIf(noKey)('registers, fetches, and deletes an agent', async () => {
    const agent = await client.agents.create({
      name: `${PREFIX}-agent`,
      agent_type: 'A2A',
      agent_url: AGENT_URL ?? 'https://example.com/.well-known/agent-card.json',
    });
    createdAgents.push(agent.uuid);

    const fetched = await client.agents.get(agent.uuid);
    expect(fetched.uuid).toBe(agent.uuid);

    await client.agents.delete(agent.uuid);
    createdAgents.splice(createdAgents.indexOf(agent.uuid), 1);
  });

  it.skipIf(noKey || !AGENT_URL)(
    'runs the full pipeline: register -> generate -> simulate -> evaluate',
    async () => {
      const scenarioType: ScenarioType = 'interview';

      // 1. Register the agent under test.
      const agent = await client.agents.create({
        name: `${PREFIX}-pipeline-agent`,
        agent_type: 'A2A',
        agent_url: AGENT_URL ?? '',
      });
      createdAgents.push(agent.uuid);

      // 2. Pick a compatible, non-benchmark tag for the scenario type.
      const tags = await client.tags.list();
      const tag = tags.find(
        (t) =>
          (t.allowed_scenario_types?.includes(scenarioType) ?? true) &&
          (t.benchmark_family === null || t.benchmark_family === undefined)
      );
      if (!tag) {
        // No compatible tag in this workspace — nothing further to assert.
        return;
      }

      // 3. Generate a scenario and wait for the job.
      const generated = await client.scenarios.generate({
        name: `${PREFIX}-scenario`,
        scenario_type: scenarioType,
        tags: [tag.name],
      });
      createdScenarios.push(generated.uuid);
      const job = await client.jobs.pollUntilTerminal(generated.job_uuid, { intervalMs: 5_000 });
      expect(job.current_status).toBe('COMPLETED');

      // 4. Preview cost, then trigger the run with auto-evaluation.
      await client.simulations.creditPreview({
        mode: 'scenario_run',
        scenario_uuid: generated.uuid,
        agent_uuid: agent.uuid,
      });
      const sim = await client.simulations.simulate({
        scenario_uuid: generated.uuid,
        agent_uuid: agent.uuid,
        evaluate_on_complete: true,
      });

      // 5. Wait for the run, then fetch the evaluation.
      const run = await client.simulations.waitForRun(sim.simulation_uuid, { intervalMs: 15_000 });
      expect(run.status).toBe('COMPLETED');

      const evalJobUuid = sim.evaluation_job_uuid ?? run.evaluation_job_uuid;
      if (evalJobUuid) {
        await client.jobs.pollUntilTerminal(evalJobUuid, { intervalMs: 10_000 });
        const evaluation = await client.simulations.getEvaluation(evalJobUuid);
        expect(evaluation).toBeTypeOf('object');
      }
    }
  );
});
