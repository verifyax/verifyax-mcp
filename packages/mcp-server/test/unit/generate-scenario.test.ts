import { describe, expect, it } from 'vitest';
import {
  createGenerateScenarioHandler,
  generationPollTimeoutMs,
} from '../../src/tools/generate-scenario.js';
import { payloadOf, stubContext } from './helpers.js';

describe('generate_scenario', () => {
  it('scales poll timeout with batch size', () => {
    expect(generationPollTimeoutMs(1)).toBe(300_000);
    expect(generationPollTimeoutMs(2)).toBe(360_000);
    expect(generationPollTimeoutMs(50)).toBe(3_240_000);
  });

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

  it('does not send description in the generate request body', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: '/scenarios/generate', body: { uuid: 's3', job_uuid: 'job-3' } },
      { method: 'GET', match: '/jobs/job-3', body: { uuid: 'job-3', current_status: 'COMPLETED' } },
    ]);
    await createGenerateScenarioHandler(ctx)({
      name: 'demo',
      scenario_type: 'info_exchange',
    });
    expect(calls[0]?.body).not.toHaveProperty('description');
  });

  it('returns batch uuids when num_scenarios > 1', async () => {
    const { ctx, calls } = stubContext([
      {
        method: 'POST',
        match: '/scenarios/generate',
        body: {
          uuid: 's-batch',
          job_uuid: 'job-batch',
          batch_uuid: 'batch-1',
          batch_scenario_uuids: ['s-batch', 's-batch-2'],
        },
      },
      {
        method: 'GET',
        match: '/jobs/job-batch',
        body: { uuid: 'job-batch', current_status: 'COMPLETED' },
      },
    ]);
    const payload = payloadOf<{
      scenario_uuid: string;
      batch_uuid: string;
      batch_scenario_uuids: string[];
    }>(
      await createGenerateScenarioHandler(ctx)({
        name: 'batch-demo',
        scenario_type: 'info_exchange',
        num_scenarios: 2,
        tag_pool: ['empathy', 'active_listening'],
      })
    );
    expect(payload.scenario_uuid).toBe('s-batch');
    expect(payload.batch_uuid).toBe('batch-1');
    expect(payload.batch_scenario_uuids).toEqual(['s-batch', 's-batch-2']);
    expect(calls[0]?.body).toMatchObject({
      num_scenarios: 2,
      tag_pool: ['empathy', 'active_listening'],
    });
  });
});
