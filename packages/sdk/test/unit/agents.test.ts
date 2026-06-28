import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/index.js';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('agents', () => {
  it('lists agents', async () => {
    server.use(
      http.get(`${API_BASE}/agents`, () =>
        HttpResponse.json([{ uuid: 'a1', name: 'one', agent_type: 'A2A' }])
      )
    );

    const agents = await makeClient().agents.list();

    expect(agents).toHaveLength(1);
    expect(agents[0]?.uuid).toBe('a1');
  });

  it('gets a single agent', async () => {
    server.use(
      http.get(`${API_BASE}/agents/a1`, () =>
        HttpResponse.json({ uuid: 'a1', name: 'one', agent_type: 'A2A' })
      )
    );

    const agent = await makeClient().agents.get('a1');

    expect(agent.name).toBe('one');
  });

  it('patches only changed fields', async () => {
    let received: unknown;
    server.use(
      http.patch(`${API_BASE}/agents/a1`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ uuid: 'a1', name: 'renamed', agent_type: 'A2A' });
      })
    );

    const agent = await makeClient().agents.update('a1', { name: 'renamed' });

    expect(received).toEqual({ name: 'renamed' });
    expect(agent.name).toBe('renamed');
  });

  it('tests an A2A agent card before registering', async () => {
    server.use(
      http.post(`${API_BASE}/agents/tests/agent-card`, () =>
        HttpResponse.json({ name: 'Some Agent', skills: [] })
      )
    );

    const card = await makeClient().agents.testAgentCard({ agent_url: 'https://x' });

    expect(card).toMatchObject({ name: 'Some Agent' });
  });

  it('discovers MCP tools via the mcp-connection probe', async () => {
    let received: unknown;
    server.use(
      http.post(`${API_BASE}/agents/tests/mcp-connection`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ tools: [{ name: 'list_compatible_tags' }] });
      })
    );

    const result = await makeClient().agents.testMcpConnection({
      mcp_url: 'https://mcp.example.com/mcp',
      auth_method: 'bearer',
      token: 'pat-123',
    });

    expect(result).toMatchObject({ tools: expect.anything() });
    expect(received).toMatchObject({ mcp_url: 'https://mcp.example.com/mcp' });
  });

  it('maps a missing agent to NotFoundError', async () => {
    server.use(
      http.get(`${API_BASE}/agents/missing`, () =>
        HttpResponse.json({ message: 'not found' }, { status: 404 })
      )
    );

    await expect(makeClient().agents.get('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
