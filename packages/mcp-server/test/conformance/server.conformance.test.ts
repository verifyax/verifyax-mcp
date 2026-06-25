import { type Server, createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A stub tag catalogue so the spawned server exercises the real list_compatible_tags
// path without touching the live API.
const STUB_TAGS = [
  { name: 'empathy', category: 'social', allowed_scenario_types: ['info_exchange', 'interview'] },
  { name: 'active_listening', allowed_scenario_types: ['interview'] },
  { name: 'gaia_task', benchmark_family: 'gaia', allowed_scenario_types: ['info_exchange'] },
];

const SERVER_PATH = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

function childEnv(webBaseUrl: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  env.VERIFYAX_API_KEY = 'conformance-test-key';
  env.VERIFYAX_WEB_BASE_URL = webBaseUrl;
  env.VERIFYAX_MCP_LOG_LEVEL = 'silent';
  return env;
}

function firstText(result: { content?: unknown }): string {
  const content = result.content;
  if (Array.isArray(content) && content[0] && typeof content[0] === 'object') {
    // MCP text content block: { type: 'text', text: string }.
    const block = content[0] as { type?: unknown; text?: unknown };
    if (block.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
  }
  throw new Error('expected a text content block in the tool result');
}

describe('MCP conformance (spawned server)', () => {
  let stub: Server;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    stub = createHttpServer((req, res) => {
      if (req.url && req.url.startsWith('/tags')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: STUB_TAGS }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const port = (stub.address() as AddressInfo).port;

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_PATH],
      env: childEnv(`http://127.0.0.1:${String(port)}`),
      stderr: 'ignore',
    });
    client = new Client({ name: 'conformance-test', version: '0.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
  });

  it('lists the registered tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('list_compatible_tags');
    const tool = tools.find((t) => t.name === 'list_compatible_tags');
    expect(tool?.description).toBeTruthy();
    expect(tool?.inputSchema).toBeDefined();
  });

  it('calls list_compatible_tags and returns structured, filtered tags', async () => {
    const result = await client.callTool({
      name: 'list_compatible_tags',
      arguments: { scenario_type: 'interview' },
    });
    const payload = JSON.parse(firstText(result)) as {
      success: boolean;
      scenario_type: string;
      tags: { name: string }[];
    };

    expect(result.isError).toBeFalsy();
    expect(payload.success).toBe(true);
    expect(payload.scenario_type).toBe('interview');
    const names = payload.tags.map((t) => t.name);
    expect(names).toContain('empathy');
    expect(names).toContain('active_listening');
    expect(names).not.toContain('gaia_task'); // benchmark => info_exchange only
  });

  it('rejects an invalid scenario_type via schema validation', async () => {
    const result = await client.callTool({
      name: 'list_compatible_tags',
      arguments: { scenario_type: 'not_a_type' },
    });
    expect(result.isError).toBe(true);
  });
});
