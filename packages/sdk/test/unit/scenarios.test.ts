import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../src/index.js';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('scenarios', () => {
  it('starts generation and returns the scenario uuid + job uuid', async () => {
    server.use(
      http.post(`${API_BASE}/scenarios/generate`, () =>
        HttpResponse.json({ uuid: 'scn-1', job_uuid: 'job-1' }, { status: 201 })
      )
    );

    const result = await makeClient().scenarios.generate({
      name: 'mcp-test-1',
      scenario_type: 'interview',
      tags: ['active_listening'],
    });

    expect(result.uuid).toBe('scn-1');
    expect(result.job_uuid).toBe('job-1');
  });

  it('generates from inline Q&A', async () => {
    let received: unknown;
    server.use(
      http.post(`${API_BASE}/scenarios/generate-from-qna`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ uuid: 'scn-q', job_uuid: 'job-q' }, { status: 201 });
      })
    );

    const result = await makeClient().scenarios.generateFromQna({
      name: 'qna-test',
      questions: [{ question: 'Capital of France?', correct_answer: 'Paris' }],
    });

    expect(result.uuid).toBe('scn-q');
    expect(received).toMatchObject({ name: 'qna-test' });
  });

  it('surfaces a 409 on delete as ConflictError', async () => {
    server.use(
      http.delete(`${API_BASE}/scenarios/scn-1`, () =>
        HttpResponse.json({ message: 'scenario still has runs' }, { status: 409 })
      )
    );

    await expect(makeClient().scenarios.delete('scn-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('lists scenarios filtered by type and status', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${API_BASE}/scenarios`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([{ uuid: 'scn-1', name: 'one' }]);
      })
    );

    const scenarios = await makeClient().scenarios.list({
      scenario_type: 'interview',
      status: 'SUCCESS',
    });

    expect(scenarios).toHaveLength(1);
    expect(seenUrl).toContain('scenario_type=interview');
    expect(seenUrl).toContain('status=SUCCESS');
  });

  it('gets and updates a scenario', async () => {
    server.use(
      http.get(`${API_BASE}/scenarios/scn-1`, () =>
        HttpResponse.json({ uuid: 'scn-1', name: 'one' })
      ),
      http.patch(`${API_BASE}/scenarios/scn-1`, () =>
        HttpResponse.json({ uuid: 'scn-1', name: 'renamed' })
      )
    );

    const client = makeClient();
    expect((await client.scenarios.get('scn-1')).name).toBe('one');
    expect((await client.scenarios.update('scn-1', { name: 'renamed' })).name).toBe('renamed');
  });

  it('fetches the generation job tied to a scenario', async () => {
    server.use(
      http.get(`${API_BASE}/scenarios/scn-1/job`, () =>
        HttpResponse.json({ uuid: 'job-1', current_status: 'COMPLETED' })
      )
    );

    const job = await makeClient().scenarios.getJob('scn-1');

    expect(job.current_status).toBe('COMPLETED');
  });
});
