import { describe, expect, it } from 'vitest';
import { createEvaluateAgentHandler } from '../../src/tools/evaluate-agent.js';
import { payloadOf, stubContext } from './helpers.js';

describe('evaluate_agent', () => {
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
});
