import { describe, expect, it } from 'vitest';
import {
  canProbeDirectLine,
  createRegisterAgentHandler,
  directLineUrlFromRegion,
  resolveAgentType,
} from '../../src/tools/register-agent.js';
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

  it('derives the Direct Line regional host from region', () => {
    expect(directLineUrlFromRegion('global')).toBe('https://directline.botframework.com');
    expect(directLineUrlFromRegion('europe')).toBe('https://europe.directline.botframework.com');
    expect(directLineUrlFromRegion('global', 'https://custom.example')).toBe(
      'https://custom.example'
    );
  });

  it('infers DIRECTLINE when directline is set without agent_type', () => {
    expect(resolveAgentType({ name: 'x', directline: { secret: 's' } })).toBe('DIRECTLINE');
    expect(resolveAgentType({ name: 'x', mcp: { url: 'https://mcp.example.com/mcp' } })).toBe(
      'MCP'
    );
    expect(resolveAgentType({ name: 'x', agent_url: 'https://a.example' })).toBe('A2A');
  });

  it('skips Direct Line probe when base_url overrides the regional host', () => {
    const args = {
      name: 'copilot',
      agent_type: 'DIRECTLINE' as const,
      directline: {
        secret: 'dl-secret',
        region: 'global' as const,
        base_url: 'https://custom.example',
      },
    };
    expect(canProbeDirectLine(args, 'https://custom.example')).toBe(false);
  });

  it('probes Direct Line then creates a DIRECTLINE agent', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'api-agent-test-directline', body: { success: true } },
      {
        method: 'POST',
        match: '/agents',
        body: {
          uuid: 'dl-1',
          name: 'copilot',
          agent_type: 'DIRECTLINE',
          agent_url: 'https://europe.directline.botframework.com',
        },
      },
    ]);
    const payload = payloadOf<{ success: boolean; connectivity_checked: boolean }>(
      await createRegisterAgentHandler(ctx)({
        name: 'copilot',
        agent_type: 'DIRECTLINE',
        directline: { secret: 'dl-secret', region: 'europe' },
      })
    );

    expect(payload.success).toBe(true);
    expect(payload.connectivity_checked).toBe(true);
    expect(calls[0]?.url).toContain('api-agent-test-directline');
    expect(calls[1]?.body).toMatchObject({
      agent_type: 'DIRECTLINE',
      agent_url: 'https://europe.directline.botframework.com',
      agent_parameters: { directline: { secret: 'dl-secret', region: 'europe' } },
    });
  });

  it('registers DIRECTLINE without agent_type when directline is provided', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'api-agent-test-directline', body: { success: true } },
      {
        method: 'POST',
        match: '/agents',
        body: { uuid: 'dl-2', name: 'copilot', agent_type: 'DIRECTLINE' },
      },
    ]);
    const payload = payloadOf<{ success: boolean }>(
      await createRegisterAgentHandler(ctx)({
        name: 'copilot',
        directline: { secret: 'dl-secret', region: 'global' },
      })
    );
    expect(payload.success).toBe(true);
    expect(calls[1]?.body).toMatchObject({ agent_type: 'DIRECTLINE' });
  });

  it('skips Direct Line probe for custom base_url but still creates the agent', async () => {
    const { ctx, calls } = stubContext([
      {
        method: 'POST',
        match: '/agents',
        body: {
          uuid: 'dl-3',
          name: 'copilot',
          agent_type: 'DIRECTLINE',
          agent_url: 'https://custom.example',
        },
      },
    ]);
    const payload = payloadOf<{ connectivity_checked: boolean }>(
      await createRegisterAgentHandler(ctx)({
        name: 'copilot',
        agent_type: 'DIRECTLINE',
        directline: { secret: 'dl-secret', region: 'global', base_url: 'https://custom.example' },
      })
    );
    expect(payload.connectivity_checked).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(/\/agents$/);
  });

  it('does not create a DIRECTLINE agent when the probe fails', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'api-agent-test-directline', status: 502, body: { message: 'bad' } },
    ]);
    const result = await createRegisterAgentHandler(ctx)({
      name: 'copilot',
      agent_type: 'DIRECTLINE',
      directline: { secret: 'dl-secret' },
    });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('probes MCP then creates an MCP agent', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'mcp-connection', body: { success: true, tools: [] } },
      {
        method: 'POST',
        match: '/agents',
        body: {
          uuid: 'mcp-1',
          name: 'remote',
          agent_type: 'MCP',
          agent_url: 'https://adapter.example.run.app',
        },
      },
    ]);
    const payload = payloadOf<{ success: boolean; connectivity_checked: boolean }>(
      await createRegisterAgentHandler(ctx)({
        name: 'remote',
        agent_type: 'MCP',
        agent_url: 'https://adapter.example.run.app',
        mcp: { url: 'https://mcp.example.com/mcp', auth_method: 'bearer', token: 'pat-1' },
      })
    );

    expect(payload.success).toBe(true);
    expect(payload.connectivity_checked).toBe(true);
    expect(calls[0]?.url).toContain('mcp-connection');
    expect(calls[1]?.body).toMatchObject({
      agent_type: 'MCP',
      agent_url: 'https://adapter.example.run.app',
      agent_parameters: {
        mcp: { url: 'https://mcp.example.com/mcp', auth_method: 'bearer', token: 'pat-1' },
      },
    });
  });

  it('does not create an MCP agent when the probe fails', async () => {
    const { ctx, calls } = stubContext([
      { method: 'POST', match: 'mcp-connection', status: 400, body: { message: 'bad url' } },
    ]);
    const result = await createRegisterAgentHandler(ctx)({
      name: 'remote',
      agent_type: 'MCP',
      agent_url: 'https://adapter.example.run.app',
      mcp: { url: 'https://mcp.example.com/mcp' },
    });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
