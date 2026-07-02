import { describe, expect, it } from 'vitest';
import { createListAgentsHandler } from '../../src/tools/list-agents.js';
import { createListRecentRunsHandler } from '../../src/tools/list-recent-runs.js';
import { createListScenariosHandler } from '../../src/tools/list-scenarios.js';
import { createPreviewRunCostHandler } from '../../src/tools/preview-run-cost.js';
import { payloadOf, stubContext } from './helpers.js';

describe('list_agents', () => {
  it('returns mapped agents and forwards filters', async () => {
    const { ctx, calls } = stubContext([
      { method: 'GET', match: '/agents', body: [{ uuid: 'a1', name: 'one', agent_type: 'A2A' }] },
    ]);
    const result = await createListAgentsHandler(ctx)({ agent_type: 'A2A' });
    const payload = payloadOf<{ success: boolean; count: number; agents: { uuid: string }[] }>(
      result
    );
    expect(payload.success).toBe(true);
    expect(payload.count).toBe(1);
    expect(payload.agents[0]?.uuid).toBe('a1');
    expect(calls[0]?.url).toContain('agent_type=A2A');
  });
});

describe('list_scenarios', () => {
  it('returns mapped scenarios', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/scenarios',
        body: [{ uuid: 's1', name: 'demo', scenario_type: 'interview', status: 'SUCCESS' }],
      },
    ]);
    const payload = payloadOf<{ scenarios: { status: string }[] }>(
      await createListScenariosHandler(ctx)({ status: 'SUCCESS' })
    );
    expect(payload.scenarios[0]?.status).toBe('SUCCESS');
  });

  it('forwards an unknown status value rather than rejecting it (open enum)', async () => {
    const { ctx, calls } = stubContext([{ method: 'GET', match: '/scenarios', body: [] }]);
    const result = await createListScenariosHandler(ctx)({ status: 'ARCHIVED_FUTURE_VALUE' });
    expect(payloadOf<{ success: boolean }>(result).success).toBe(true);
    expect(calls[0]?.url).toContain('status=ARCHIVED_FUTURE_VALUE');
  });
});

describe('list_recent_runs', () => {
  it('returns mapped runs', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations',
        body: [{ uuid: 'r1', status: 'COMPLETED', agent_uuid: 'a1' }],
      },
    ]);
    const payload = payloadOf<{ runs: { uuid: string; status: string }[] }>(
      await createListRecentRunsHandler(ctx)({ status: 'COMPLETED' })
    );
    expect(payload.runs[0]).toMatchObject({ uuid: 'r1', status: 'COMPLETED' });
  });

  it('forwards an unknown status value rather than rejecting it (open enum)', async () => {
    const { ctx, calls } = stubContext([{ method: 'GET', match: '/simulations', body: [] }]);
    const result = await createListRecentRunsHandler(ctx)({ status: 'QUEUED_FUTURE_VALUE' });
    expect(payloadOf<{ success: boolean }>(result).success).toBe(true);
    expect(calls[0]?.url).toContain('status=QUEUED_FUTURE_VALUE');
  });
});

describe('preview_run_cost', () => {
  it('maps the credit preview fields', async () => {
    const { ctx, calls } = stubContext([
      {
        method: 'POST',
        match: 'workspace-credit-preview',
        body: { balance: 100, newRunEstimatedCredits: 8, existingRuns: 2 },
      },
    ]);
    const payload = payloadOf<{ estimated_credits: number; balance: number }>(
      await createPreviewRunCostHandler(ctx)({ scenario_uuid: 's1', agent_uuid: 'a1' })
    );
    expect(payload.estimated_credits).toBe(8);
    expect(payload.balance).toBe(100);
    expect(calls[0]?.body).toMatchObject({ mode: 'scenario_run', scenario_uuid: 's1' });
  });
});
