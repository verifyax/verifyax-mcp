import { describe, expect, it } from 'vitest';
import {
  createEvaluateAgentHandler,
  evaluatePollTimeoutMs,
} from '../../src/tools/evaluate-agent.js';
import { payloadOf, stubContext } from './helpers.js';

describe('evaluate_agent', () => {
  it('scales poll timeout with timeout_minutes', () => {
    expect(evaluatePollTimeoutMs(undefined)).toBe(600_000);
    expect(evaluatePollTimeoutMs(60)).toBe(60 * 60_000 + 300_000);
    expect(evaluatePollTimeoutMs(240)).toBe(240 * 60_000 + 300_000);
  });

  it('runs the full pipeline and returns the evaluation', async () => {
    const { ctx } = stubContext([
      { method: 'POST', match: 'workspace-credit-preview', body: { newRunEstimatedCredits: 7 } },
      {
        method: 'POST',
        match: 'engine/simulate/scenario',
        body: { simulation_uuid: 'r1', evaluation_job_uuid: 'eval-1' },
      },
      // Order matters: the evaluations route must precede the generic run route.
      { method: 'GET', match: '/simulations/evaluations/', body: { overall_score: 0.83 } },
      { method: 'GET', match: '/simulations/r1', body: { uuid: 'r1', status: 'COMPLETED' } },
      {
        method: 'GET',
        match: '/jobs/eval-1',
        body: { uuid: 'eval-1', current_status: 'COMPLETED' },
      },
    ]);
    const payload = payloadOf<{
      success: boolean;
      simulation_uuid: string;
      run_status: string;
      credits_estimate: number;
      evaluation: { overall_score: number };
    }>(await createEvaluateAgentHandler(ctx)({ agent_uuid: 'a1', scenario_uuid: 's1' }));

    expect(payload.success).toBe(true);
    expect(payload.simulation_uuid).toBe('r1');
    expect(payload.run_status).toBe('COMPLETED');
    expect(payload.credits_estimate).toBe(7);
    expect(payload.evaluation.overall_score).toBe(0.83);
  });

  it('surfaces a FAILED run as a structured error', async () => {
    const { ctx } = stubContext([
      { method: 'POST', match: 'workspace-credit-preview', body: { newRunEstimatedCredits: 7 } },
      { method: 'POST', match: 'engine/simulate/scenario', body: { simulation_uuid: 'r2' } },
      { method: 'GET', match: '/simulations/r2', body: { uuid: 'r2', status: 'FAILED' } },
    ]);
    const result = await createEvaluateAgentHandler(ctx)({ agent_uuid: 'a1', scenario_uuid: 's1' });
    expect(result.isError).toBe(true);
    expect(payloadOf<{ success: boolean }>(result).success).toBe(false);
  });

  it('resolves the evaluation job from evaluation_jobs[] when the scalar is absent', async () => {
    const { ctx } = stubContext([
      { method: 'POST', match: 'workspace-credit-preview', body: { newRunEstimatedCredits: 7 } },
      // Neither the simulate response nor the run carries a scalar evaluation_job_uuid.
      { method: 'POST', match: 'engine/simulate/scenario', body: { simulation_uuid: 'r1' } },
      { method: 'GET', match: '/simulations/evaluations/', body: { overall_score: 0.5 } },
      {
        method: 'GET',
        match: '/jobs/eval-9',
        body: { uuid: 'eval-9', current_status: 'COMPLETED' },
      },
      {
        method: 'GET',
        match: '/simulations/r1',
        body: {
          uuid: 'r1',
          status: 'COMPLETED',
          evaluation_jobs: [{ uuid: 'eval-0' }, { uuid: 'eval-9' }],
        },
      },
    ]);
    const payload = payloadOf<{ success: boolean; evaluation: { overall_score: number } }>(
      await createEvaluateAgentHandler(ctx)({ agent_uuid: 'a1', scenario_uuid: 's1' })
    );
    expect(payload.success).toBe(true);
    expect(payload.evaluation.overall_score).toBe(0.5);
  });

  it('fails explicitly when the run completes but no evaluation can be started', async () => {
    const { ctx } = stubContext([
      { method: 'POST', match: 'workspace-credit-preview', body: { newRunEstimatedCredits: 7 } },
      { method: 'POST', match: 'engine/simulate/scenario', body: { simulation_uuid: 'r5' } },
      { method: 'GET', match: '/simulations/r5', body: { uuid: 'r5', status: 'COMPLETED' } },
      // Trigger yields no job uuid → nothing to poll.
      { method: 'POST', match: 'engine/evaluate/trigger', body: {} },
    ]);
    const result = await createEvaluateAgentHandler(ctx)({ agent_uuid: 'a1', scenario_uuid: 's1' });
    expect(result.isError).toBe(true);
    const payload = payloadOf<{ success: boolean; reason: string }>(result);
    expect(payload.success).toBe(false);
    expect(payload.reason).toMatch(/no evaluation could be started/i);
  });

  it('forwards timeout_minutes to simulate and credit preview', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'workspace-credit-preview', body: { newRunEstimatedCredits: 7 } },
      {
        method: 'POST',
        match: 'engine/simulate/scenario',
        body: { simulation_uuid: 'r1', evaluation_job_uuid: 'eval-1' },
      },
      { method: 'GET', match: '/simulations/evaluations/', body: { overall_score: 0.83 } },
      { method: 'GET', match: '/simulations/r1', body: { uuid: 'r1', status: 'COMPLETED' } },
      {
        method: 'GET',
        match: '/jobs/eval-1',
        body: { uuid: 'eval-1', current_status: 'COMPLETED' },
      },
    ]);
    await createEvaluateAgentHandler(ctx)({
      agent_uuid: 'a1',
      scenario_uuid: 's1',
      timeout_minutes: 60,
    });
    expect(calls[0]?.body).toMatchObject({ timeout_minutes: 60 });
    expect(calls[1]?.body).toMatchObject({ timeout_minutes: 60 });
  });
});
