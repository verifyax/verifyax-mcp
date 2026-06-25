import { describe, expect, it } from 'vitest';
import { createRegisterAgentHandler } from '../../src/tools/register-agent.js';
import { payloadOf, stubContext } from './helpers.js';

describe('register_agent', () => {
  it('checks the A2A card, then creates the agent', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'agent-card', body: { name: 'Some Agent' } },
      {
        method: 'POST',
        match: '/agents',
        body: { uuid: 'a1', name: 'my-agent', agent_type: 'A2A' },
      },
    ]);
    const payload = payloadOf<{
      success: boolean;
      agent: { uuid: string };
      connectivity_checked: boolean;
    }>(await createRegisterAgentHandler(ctx)({ name: 'my-agent', agent_url: 'https://x' }));

    expect(payload.success).toBe(true);
    expect(payload.agent.uuid).toBe('a1');
    expect(payload.connectivity_checked).toBe(true);
    // Card test happens before creation.
    expect(calls[0]?.url).toContain('agent-card');
    expect(calls[1]?.url).toMatch(/\/agents$/);
  });

  it('does not create the agent when the card check fails', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'agent-card', status: 502, body: { message: 'unreachable' } },
    ]);
    const result = await createRegisterAgentHandler(ctx)({
      name: 'my-agent',
      agent_url: 'https://x',
    });
    expect(result.isError).toBe(true);
    // Only the card test was attempted — no POST /agents create.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('agent-card');
  });

  it('skips the card check for API agents', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: '/agents', body: { uuid: 'a2', name: 'rest', agent_type: 'API' } },
    ]);
    const payload = payloadOf<{ connectivity_checked: boolean }>(
      await createRegisterAgentHandler(ctx)({
        name: 'rest',
        agent_url: 'https://x',
        agent_type: 'API',
      })
    );
    expect(payload.connectivity_checked).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
