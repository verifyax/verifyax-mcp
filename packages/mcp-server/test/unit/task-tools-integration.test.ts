import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { VerifyaxClient } from '@verifyax/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/logging.js';
import { createServer } from '../../src/server.js';
import { payloadOf } from './helpers.js';

function stubClient(
  handlers: Array<(url: string, method: string) => { body?: unknown } | null>
): VerifyaxClient {
  let callIndex = 0;
  return new VerifyaxClient({
    apiKey: 'test',
    baseUrl: 'https://api.test/api/v1',
    webBaseUrl: 'https://api.test/web/api/v1',
    maxRetries: 0,
    fetch: async (url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const response = handlers[callIndex]?.(url, method);
      callIndex += 1;
      if (!response) {
        return new Response(JSON.stringify({ message: 'no stub' }), {
          status: 599,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(response.body ?? {}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}

describe('task tool registration (in-memory MCP)', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;
  let clientTransport: InMemoryTransport;

  afterEach(async () => {
    await client?.close();
  });

  async function connectServer(
    handlers: Array<(url: string, method: string) => { body?: unknown } | null>
  ) {
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const { server } = createServer({
      client: stubClient(handlers),
      logger: createLogger({ level: 'silent' }),
    });
    await server.connect(serverTransport);
    client = new Client({ name: 'task-integration', version: '0.0.0' });
    await client.connect(clientTransport);
  }

  it('blocks generate_scenario for clients without task augmentation', async () => {
    await connectServer([
      () => ({ body: { uuid: 's1', job_uuid: 'job-1' } }),
      () => ({ body: { uuid: 'job-1', current_status: 'COMPLETED' } }),
    ]);

    const result = await client.callTool({
      name: 'generate_scenario',
      arguments: { name: 'demo', scenario_type: 'interview' },
    });
    const payload = payloadOf<{ success: boolean; scenario_uuid: string }>(result);
    expect(payload.success).toBe(true);
    expect(payload.scenario_uuid).toBe('s1');
  });

  it('returns a task handle when the client requests task augmentation', async () => {
    await connectServer([
      () => ({ body: { uuid: 's2', job_uuid: 'job-2' } }),
      () => ({ body: { uuid: 'job-2', current_status: 'COMPLETED' } }),
    ]);

    const stream = client.experimental.tasks.callToolStream(
      { name: 'generate_scenario', arguments: { name: 'demo', scenario_type: 'interview' } },
      undefined,
      { task: { ttl: 60_000 } }
    );

    let taskId: string | undefined;
    for await (const message of stream) {
      if (message.type === 'taskCreated') {
        taskId = message.task.taskId;
        expect(message.task.status).toBe('working');
      }
      if (message.type === 'result') {
        const payload = payloadOf<{ success: boolean; scenario_uuid: string }>(message.result);
        expect(payload.scenario_uuid).toBe('s2');
      }
    }
    expect(taskId).toBeTruthy();
  });
});
