import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { JobFailedError } from '../../src/index.js';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('simulations', () => {
  it('previews credits', async () => {
    server.use(
      http.post(`${API_BASE}/engine/workspace-credit-preview`, () =>
        HttpResponse.json({ balance: 100, newRunEstimatedCredits: 7 })
      )
    );

    const preview = await makeClient().simulations.creditPreview({
      mode: 'scenario_run',
      scenario_uuid: 'scn-1',
    });

    expect(preview.newRunEstimatedCredits).toBe(7);
  });

  it('triggers a run and returns the simulation uuid', async () => {
    server.use(
      http.post(`${API_BASE}/engine/simulate/scenario`, () =>
        HttpResponse.json({ simulation_uuid: 'run-1', evaluation_job_uuid: 'eval-1' })
      )
    );

    const result = await makeClient().simulations.simulate({
      scenario_uuid: 'scn-1',
      agent_uuid: 'agt-1',
      evaluate_on_complete: true,
    });

    expect(result.simulation_uuid).toBe('run-1');
  });

  it('waitForRun polls until COMPLETED', async () => {
    const statuses = ['CREATED', 'IN_PROGRESS', 'COMPLETED'];
    let call = 0;
    server.use(
      http.get(`${API_BASE}/simulations/run-1`, () => {
        const status = statuses[Math.min(call, statuses.length - 1)];
        call += 1;
        return HttpResponse.json({ uuid: 'run-1', status });
      })
    );

    const run = await makeClient().simulations.waitForRun('run-1', { intervalMs: 1 });

    expect(run.status).toBe('COMPLETED');
  });

  it('waitForRun throws JobFailedError on FAILED', async () => {
    server.use(
      http.get(`${API_BASE}/simulations/run-2`, () =>
        HttpResponse.json({ uuid: 'run-2', status: 'FAILED' })
      )
    );

    await expect(
      makeClient().simulations.waitForRun('run-2', { intervalMs: 1 })
    ).rejects.toBeInstanceOf(JobFailedError);
  });
});
