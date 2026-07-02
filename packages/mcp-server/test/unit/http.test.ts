import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AuthError } from '@verifyax/sdk';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { describe, expect, it } from 'vitest';
import { readApiKeyFromRequest } from '../../src/auth.js';
import {
  type ApiKeyValidator,
  type McpSession,
  assertHostBinding,
  registerStreamableHttpRoutes,
  resolveAllowedHosts,
  resolveHost,
  resolvePort,
  sweepIdleSessions,
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

async function startHttpServer(
  validateApiKey: ApiKeyValidator = async () => {}
): Promise<StartedHttpServer> {
  const app = createMcpExpressApp({ host: '127.0.0.1' });
  const logger = createLogger({ level: 'silent' });
  // Inject a no-op key validator by default so unit tests stay hermetic (the
  // real validator makes a network call).
  const sessions = registerStreamableHttpRoutes(
    app,
    logger,
    { VERIFYAX_MCP_LOG_LEVEL: 'silent' },
    { validateApiKey }
  );
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
    expect(readApiKeyFromRequest({ headers: { authorization: 'Bearer sk-ver-api-abc' } })).toBe(
      'sk-ver-api-abc'
    );
  });

  it('reads X-VerifyAX-API-Key header', () => {
    expect(readApiKeyFromRequest({ headers: { 'x-verifyax-api-key': 'sk-ver-api-xyz' } })).toBe(
      'sk-ver-api-xyz'
    );
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

describe('assertHostBinding (SEC-5)', () => {
  it('allows loopback without an allowlist', () => {
    expect(() => assertHostBinding('127.0.0.1', undefined)).not.toThrow();
    expect(() => assertHostBinding('localhost', undefined)).not.toThrow();
  });

  it('refuses a public bind without VERIFYAX_MCP_ALLOWED_HOSTS', () => {
    expect(() => assertHostBinding('0.0.0.0', undefined)).toThrow(/VERIFYAX_MCP_ALLOWED_HOSTS/);
    expect(() => assertHostBinding('0.0.0.0', [])).toThrow(/VERIFYAX_MCP_ALLOWED_HOSTS/);
  });

  it('allows a public bind once an allowlist is set', () => {
    expect(() => assertHostBinding('0.0.0.0', ['mcp.verifyax.com'])).not.toThrow();
  });
});

describe('sweepIdleSessions (SEC-4)', () => {
  it('evicts sessions idle past the TTL and keeps fresh ones', () => {
    const logger = createLogger({ level: 'silent' });
    const closed: string[] = [];
    const fakeSession = (id: string, lastSeenMs: number): McpSession =>
      ({
        transport: { close: async () => void closed.push(id) },
        ctx: {} as McpSession['ctx'],
        keyHash: 'h',
        lastSeenMs,
      }) as unknown as McpSession;

    const now = 1_000_000;
    const sessions = new Map<string, McpSession>([
      ['stale', fakeSession('stale', now - 60_000)],
      ['fresh', fakeSession('fresh', now - 1_000)],
    ]);

    const evicted = sweepIdleSessions(sessions, now, 30_000, logger);
    expect(evicted).toBe(1);
    expect(sessions.has('stale')).toBe(false);
    expect(sessions.has('fresh')).toBe(true);
    expect(closed).toEqual(['stale']);
  });
});

describe('Streamable HTTP per-request auth (SEC-2, SEC-3)', () => {
  it('rejects an initialize request with no API key', async () => {
    const started = await startHttpServer();
    try {
      const response = await fetch(`${started.url}/mcp`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify(INITIALIZE_REQUEST),
      });
      expect(response.status).toBe(401);
      expect(started.sessions.size).toBe(0);
    } finally {
      await stopHttpServer(started);
    }
  });

  it('rejects a key the validator refuses (invalid key)', async () => {
    const started = await startHttpServer(async () => {
      throw new AuthError('invalid api key');
    });
    try {
      const response = await fetch(`${started.url}/mcp`, {
        method: 'POST',
        headers: mcpHeaders(),
        body: JSON.stringify(INITIALIZE_REQUEST),
      });
      expect(response.status).toBe(401);
      expect(started.sessions.size).toBe(0);
    } finally {
      await stopHttpServer(started);
    }
  });

  it('binds a session to its key: a follow-up without/with a wrong key is rejected', async () => {
    const started = await startHttpServer();
    try {
      const init = await fetch(`${started.url}/mcp`, {
        method: 'POST',
        headers: mcpHeaders(),
        body: JSON.stringify(INITIALIZE_REQUEST),
      });
      const sid = init.headers.get('mcp-session-id') ?? '';
      expect(started.sessions.has(sid)).toBe(true);

      const toolsList = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

      // Same session id, no key → 401 (session id alone is not a credential).
      const noKey = await fetch(`${started.url}/mcp`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-session-id': sid,
        },
        body: toolsList,
      });
      expect(noKey.status).toBe(401);

      // Same session id, a different key → 403 (key does not match the session).
      const wrongKey = await fetch(`${started.url}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({ authorization: 'Bearer sk-ver-api-other', 'mcp-session-id': sid }),
        body: toolsList,
      });
      expect(wrongKey.status).toBe(403);
    } finally {
      await stopHttpServer(started);
    }
  });
});
