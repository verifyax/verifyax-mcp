import { describe, expect, it } from 'vitest';
import { createPreviewRunCostHandler } from '../../src/tools/preview-run-cost.js';
import { payloadOf, stubContext } from './helpers.js';

const PREVIEW_BODY = {
  newRunEstimatedCredits: 60.85,
  balance: 113.02,
  existingRuns: [],
  pendingCommittedTotal: 0,
};

describe('preview_run_cost', () => {
  it('returns the estimate fields from the preview', async () => {
    const { ctx } = stubContext([
      { method: 'POST', match: 'workspace-credit-preview', body: PREVIEW_BODY },
    ]);
    const payload = payloadOf<{
      success: boolean;
      estimated_credits: number;
      balance: number;
      pending_committed_total: number;
    }>(await createPreviewRunCostHandler(ctx)({ scenario_uuid: 's1' }));

    expect(payload.success).toBe(true);
    expect(payload.estimated_credits).toBe(60.85);
    expect(payload.balance).toBe(113.02);
    expect(payload.pending_committed_total).toBe(0);
  });

  it('defaults num_runs to 1 when omitted (the gateway requires it for scenario_run)', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'workspace-credit-preview', body: PREVIEW_BODY },
    ]);
    await createPreviewRunCostHandler(ctx)({ scenario_uuid: 's1' });
    expect(calls[0]?.body).toMatchObject({
      mode: 'scenario_run',
      scenario_uuid: 's1',
      num_runs: 1,
    });
  });

  it('forwards an explicit num_runs, agent_uuid, and timeout_minutes', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'workspace-credit-preview', body: PREVIEW_BODY },
    ]);
    await createPreviewRunCostHandler(ctx)({
      scenario_uuid: 's1',
      agent_uuid: 'a1',
      num_runs: 3,
      timeout_minutes: 30,
    });
    expect(calls[0]?.body).toMatchObject({
      mode: 'scenario_run',
      scenario_uuid: 's1',
      agent_uuid: 'a1',
      num_runs: 3,
      timeout_minutes: 30,
    });
  });
});
