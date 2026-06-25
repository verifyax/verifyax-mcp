import { describe, expect, it } from 'vitest';
import { createGenerateScenarioHandler } from '../../src/tools/generate-scenario.js';
import { payloadOf, stubContext } from './helpers.js';

describe('generate_scenario', () => {
  it('generates and blocks until the job completes', async () => {
    const { ctx } = stubContext([
      { method: 'POST', match: '/scenarios/generate', body: { uuid: 's1', job_uuid: 'job-1' } },
      { method: 'GET', match: '/jobs/job-1', body: { uuid: 'job-1', current_status: 'COMPLETED' } },
    ]);
    const payload = payloadOf<{ success: boolean; scenario_uuid: string; job_status: string }>(
      await createGenerateScenarioHandler(ctx)({
        name: 'demo',
        scenario_type: 'interview',
        tags: ['active_listening'],
      })
    );
    expect(payload.success).toBe(true);
    expect(payload.scenario_uuid).toBe('s1');
    expect(payload.job_status).toBe('COMPLETED');
  });

  it('surfaces a FAILED generation job with its error_details', async () => {
    const { ctx } = stubContext([
      { method: 'POST', match: '/scenarios/generate', body: { uuid: 's2', job_uuid: 'job-2' } },
      {
        method: 'GET',
        match: '/jobs/job-2',
        body: {
          uuid: 'job-2',
          current_status: 'FAILED',
          error_details: 'tags do not exist in the skill tags registry',
        },
      },
    ]);
    const result = await createGenerateScenarioHandler(ctx)({
      name: 'demo',
      scenario_type: 'interview',
      tags: ['bogus'],
    });
    const payload = payloadOf<{ success: boolean; reason: string }>(result);
    expect(result.isError).toBe(true);
    expect(payload.reason).toContain('skill tags registry');
  });
});
