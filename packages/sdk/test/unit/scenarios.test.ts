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

  it('surfaces a 409 on delete as ConflictError', async () => {
    server.use(
      http.delete(`${API_BASE}/scenarios/scn-1`, () =>
        HttpResponse.json({ message: 'scenario still has runs' }, { status: 409 })
      )
    );

    await expect(makeClient().scenarios.delete('scn-1')).rejects.toBeInstanceOf(ConflictError);
  });
});
