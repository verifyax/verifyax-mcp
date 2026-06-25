import { describe, expect, it } from 'vitest';
import { createDeleteAgentHandler } from '../../src/tools/delete-agent.js';
import { createDeleteScenarioHandler } from '../../src/tools/delete-scenario.js';
import { payloadOf, stubContext } from './helpers.js';

describe('delete_agent', () => {
  it('confirms deletion', async () => {
    const { ctx } = stubContext([{ method: 'DELETE', match: '/agents/a1', status: 204 }]);
    const payload = payloadOf<{ success: boolean; deleted: boolean; agent_uuid: string }>(
      await createDeleteAgentHandler(ctx)({ agent_uuid: 'a1' })
    );
    expect(payload).toMatchObject({ success: true, deleted: true, agent_uuid: 'a1' });
  });
});

describe('delete_scenario', () => {
  it('surfaces a 409 as a structured conflict error with a fix', async () => {
    const { ctx } = stubContext([
      {
        method: 'DELETE',
        match: '/scenarios/s1',
        status: 409,
        body: { message: 'scenario still has runs' },
      },
    ]);
    const result = await createDeleteScenarioHandler(ctx)({ scenario_uuid: 's1' });
    const payload = payloadOf<{ success: boolean; reason: string; suggested_fix?: string }>(result);
    expect(result.isError).toBe(true);
    expect(payload.success).toBe(false);
    expect(payload.reason).toContain('Conflict');
    expect(payload.suggested_fix).toBeTruthy();
  });
});
