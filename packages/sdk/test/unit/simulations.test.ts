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

  it('previews generation cost without a scenario_uuid', async () => {
    let received: unknown;
    server.use(
      http.post(`${API_BASE}/engine/workspace-credit-preview`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ newRunEstimatedCredits: 3 });
      })
    );

    // scenario_generation mode does not require scenario_uuid.
    const preview = await makeClient().simulations.creditPreview({ mode: 'scenario_generation' });

    expect(preview.newRunEstimatedCredits).toBe(3);
    expect(received).toEqual({ mode: 'scenario_generation' });
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

  it('lists runs filtered by status and agent', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${API_BASE}/simulations`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([{ uuid: 'run-1', status: 'COMPLETED' }]);
      })
    );

    const runs = await makeClient().simulations.list({ status: 'COMPLETED', agent_uuid: 'agt-1' });

    expect(runs).toHaveLength(1);
    expect(seenUrl).toContain('status=COMPLETED');
    expect(seenUrl).toContain('agent_uuid=agt-1');
  });

  it('cancels and deletes a run', async () => {
    server.use(
      http.post(
        `${API_BASE}/simulations/run-1/cancel`,
        () => new HttpResponse(null, { status: 204 })
      ),
      http.delete(`${API_BASE}/simulations/run-1`, () => new HttpResponse(null, { status: 204 }))
    );

    const client = makeClient();
    await expect(client.simulations.cancel('run-1')).resolves.toBeUndefined();
    await expect(client.simulations.delete('run-1')).resolves.toBeUndefined();
  });

  it('triggers evaluation and fetches results', async () => {
    server.use(
      http.post(`${API_BASE}/engine/evaluate/trigger`, () =>
        HttpResponse.json({ evaluation_job_uuid: 'eval-1' })
      ),
      http.get(`${API_BASE}/simulations/evaluations/eval-1`, () =>
        HttpResponse.json({ overall_score: 0.82 })
      )
    );

    const client = makeClient();
    const triggered = await client.simulations.triggerEvaluation('run-1');
    expect(triggered.evaluation_job_uuid).toBe('eval-1');

    const evaluation = await client.simulations.getEvaluation('eval-1');
    expect(evaluation).toMatchObject({ overall_score: 0.82 });
  });

  it('fetches evaluation scores and run output', async () => {
    server.use(
      http.get(`${API_BASE}/simulations/run-1/evaluation/scores`, () =>
        HttpResponse.json({
          success: true,
          data: { overall_score: 0.91, per_tag_scores: { empathy: 0.9 } },
        })
      ),
      http.get(`${API_BASE}/simulations/run-1/output`, () =>
        HttpResponse.json({ rounds: [{ messages: [] }] })
      )
    );

    const client = makeClient();
    expect((await client.simulations.getEvaluationScores('run-1')).overall_score).toBe(0.91);
    expect(await client.simulations.getOutput('run-1')).toMatchObject({
      rounds: expect.anything(),
    });
  });

  it('downloads a binary run artifact as raw bytes', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${API_BASE}/simulations/run-1/files`, ({ request }) => {
        seenUrl = request.url;
        return new HttpResponse(new Uint8Array([1, 2, 3, 4]), {
          headers: { 'content-type': 'application/octet-stream' },
        });
      })
    );

    const bytes = await makeClient().simulations.downloadFile('run-1', 'files/messages/1.pdf');

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    expect(seenUrl).toContain('path=files%2Fmessages%2F1.pdf');
  });

  it('lists runs for a scenario and fetches batch scores', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${API_BASE}/simulations/scenarios/scn-1`, () =>
        HttpResponse.json([{ uuid: 'run-1', status: 'COMPLETED' }])
      ),
      http.get(`${API_BASE}/simulations/scores`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json({
          success: true,
          data: { scores: { 'run-1': { overall_score: 0.8 } } },
        });
      })
    );

    const client = makeClient();
    expect(await client.simulations.listForScenario('scn-1')).toHaveLength(1);
    const scores = await client.simulations.getScores(['run-1', 'run-2']);
    expect(scores['run-1']?.overall_score).toBe(0.8);
    expect(seenUrl).toContain('ids=run-1%2Crun-2');
  });
});
