import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { describe, expect, it } from 'vitest';
import { readApiKeyFromRequest } from '../../src/auth.js';
import {
  type McpSession,
  registerStreamableHttpRoutes,
  resolveAllowedHosts,
  resolveHost,
  resolvePort,
} from '../../src/http.js';
import { createLogger } from '../../src/logging.js';

const INITIALIZE_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'http-unit-test', version: '0.0.0' },
  },
};

interface StartedHttpServer {
  url: string;
  server: HttpServer;
  sessions: Map<string, McpSession>;
}

async function startHttpServer(): Promise<StartedHttpServer> {
  const app = createMcpExpressApp({ host: '127.0.0.1' });
  const logger = createLogger({ level: 'silent' });
  const sessions = registerStreamableHttpRoutes(app, logger, {
    VERIFYAX_MCP_LOG_LEVEL: 'silent',
  });
  const server = createHttpServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${String(port)}`, server, sessions };
}

async function stopHttpServer({ server, sessions }: StartedHttpServer): Promise<void> {
  await Promise.all(Array.from(sessions.values(), async (session) => session.transport.close()));
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function mcpHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    accept: 'application/json, text/event-stream',
    authorization: 'Bearer sk-ver-api-test',
    'content-type': 'application/json',
    ...extra,
  };
}

describe('readApiKeyFromRequest', () => {
  it('reads Bearer authorization', () => {
    expect(
      readApiKeyFromRequest({ headers: { authorization: 'Bearer sk-ver-api-abc' } })
    ).toBe('sk-ver-api-abc');
  });

  it('reads X-VerifyAX-API-Key header', () => {
    expect(
      readApiKeyFromRequest({ headers: { 'x-verifyax-api-key': 'sk-ver-api-xyz' } })
    ).toBe('sk-ver-api-xyz');
  });

  it('returns undefined when no key is present', () => {
    expect(readApiKeyFromRequest({ headers: {} })).toBeUndefined();
    expect(readApiKeyFromRequest({ headers: { authorization: 'Basic x' } })).toBeUndefined();
  });
});

describe('Streamable HTTP session routing', () => {
  it('starts a new session for initialize requests with an unknown session ID', async () => {
    const started = await startHttpServer();
    try {
      const response = await fetch(`${started.url}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({ 'mcp-session-id': 'expired-session' }),
        body: JSON.stringify(INITIALIZE_REQUEST),
      });

      expect(response.status).toBe(200);
      const newSessionId = response.headers.get('mcp-session-id');
      expect(newSessionId).toBeTruthy();
      expect(newSessionId).not.toBe('expired-session');
      expect(started.sessions.has(newSessionId ?? '')).toBe(true);
    } finally {
      await stopHttpServer(started);
    }
  });

  it('rejects non-initialize requests with an unknown session ID', async () => {
    const started = await startHttpServer();
    try {
      const response = await fetch(`${started.url}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({ 'mcp-session-id': 'expired-session' }),
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      });
      const body = (await response.json()) as { error?: { message?: string } };

      expect(response.status).toBe(400);
      expect(body.error?.message).toBe('Bad Request: No valid session ID provided');
      expect(started.sessions.size).toBe(0);
    } finally {
      await stopHttpServer(started);
    }
  });
});

describe('HTTP env resolution', () => {
  it('defaults host and port for Cloud Run', () => {
    expect(resolveHost({})).toBe('127.0.0.1');
    expect(resolvePort({})).toBe(8080);
    expect(resolvePort({ PORT: '3000' })).toBe(3000);
  });

  it('parses allowed hosts', () => {
    expect(resolveAllowedHosts({ VERIFYAX_MCP_ALLOWED_HOSTS: 'localhost, my.run.app' })).toEqual([
      'localhost',
      'my.run.app',
    ]);
  });
});
