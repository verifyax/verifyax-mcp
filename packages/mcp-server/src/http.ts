#!/usr/bin/env node
// HTTP entry point (bin: verifyax-mcp-server-http).
// Serves MCP over Streamable HTTP. Each client sends its own VerifyAX API key on
// every request (Authorization: Bearer / X-VerifyAX-API-Key).
//
// Hardening (see the engineering review, SEC-2..6 / OPS-1..4):
//  - The key is re-read and re-authorized on EVERY request; a session id alone
//    never grants access (a session is bound to the hash of the key that created
//    it). This closes session hijacking and per-request-auth gaps.
//  - The key is validated once at session creation (a cheap authed call), so a
//    random string cannot mint a session.
//  - Sessions carry an idle TTL and a hard cap, and are swept, so a dropped
//    client cannot leak a live key or exhaust memory.
//  - A per-key rate limit throttles abuse.
//  - Binding a non-loopback host without VERIFYAX_MCP_ALLOWED_HOSTS is refused
//    at startup (DNS-rebinding protection).
// NOTE: keys still reside in memory for a session's (bounded) lifetime — this is
// inherent to a bring-your-own-key pass-through. Eliminating custody entirely is
// the OAuth roadmap item, not this transport.

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthError } from '@verifyax/sdk';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { readApiKeyFromRequest } from './auth.js';
import { createToolContextFromApiKey, reportFatal } from './bootstrap.js';
import { createLogger } from './logging.js';
import { isMainModule } from './main-module.js';
import { createServer } from './server.js';
import type { ToolContext } from './tools/context.js';

const MCP_PATH = '/mcp';

/** Evict sessions idle longer than this (ms). */
const SESSION_IDLE_TTL_MS = 30 * 60_000;
/** How often to sweep idle sessions (ms). */
const SESSION_SWEEP_INTERVAL_MS = 60_000;
/** Hard cap on concurrent sessions per instance. */
const MAX_SESSIONS = 500;
/** Per-key request rate limit. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 240;

export interface McpSession {
  transport: StreamableHTTPServerTransport;
  ctx: ToolContext;
  /** SHA-256 of the API key that created the session; every request must match. */
  keyHash: string;
  lastSeenMs: number;
}

/** Validates that an API key is real before a session is minted. */
export type ApiKeyValidator = (ctx: ToolContext) => Promise<void>;

export interface StreamableHttpOptions {
  /** Override the session-creation key validation (tests inject a no-op). */
  validateApiKey?: ApiKeyValidator;
  /** Clock, for tests. */
  now?: () => number;
}

const defaultValidateApiKey: ApiKeyValidator = async (ctx) => {
  // A cheap authed call — rejects any key the gateway does not accept.
  await ctx.client.usage.getBalance();
};

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function keyMatchesHash(presentedKey: string, keyHash: string): boolean {
  const presented = Buffer.from(hashApiKey(presentedKey));
  const expected = Buffer.from(keyHash);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export function resolveHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOST?.trim() || '127.0.0.1';
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORT?.trim();
  if (raw) {
    const port = Number.parseInt(raw, 10);
    if (Number.isFinite(port) && port > 0) {
      return port;
    }
  }
  return 8080;
}

export function resolveAllowedHosts(env: NodeJS.ProcessEnv = process.env): string[] | undefined {
  const raw = env.VERIFYAX_MCP_ALLOWED_HOSTS?.trim();
  if (!raw) {
    return undefined;
  }
  const hosts = raw
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
  return hosts.length > 0 ? hosts : undefined;
}

/**
 * Refuse to bind a public interface without an allowed-hosts allowlist. Without
 * it the MCP SDK leaves Host-header validation off on `0.0.0.0`, opening a
 * DNS-rebinding vector on a public endpoint.
 */
export function assertHostBinding(host: string, allowedHosts: string[] | undefined): void {
  const loopback = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  if (!loopback && (!allowedHosts || allowedHosts.length === 0)) {
    throw new Error(
      `Refusing to bind ${host} without VERIFYAX_MCP_ALLOWED_HOSTS. Set it to the public ` +
        'host(s) that serve /mcp (custom domain + the *.run.app host) so Host-header ' +
        'validation is enabled.'
    );
  }
}

/** Close and drop sessions idle beyond the TTL. Returns the number evicted. */
export function sweepIdleSessions(
  sessions: Map<string, McpSession>,
  now: number,
  ttlMs: number,
  logger: ReturnType<typeof createLogger>
): number {
  let evicted = 0;
  for (const [sid, session] of sessions) {
    if (now - session.lastSeenMs > ttlMs) {
      sessions.delete(sid);
      void session.transport.close();
      evicted += 1;
    }
  }
  if (evicted > 0) {
    logger.info('evicted idle sessions', { count: evicted });
  }
  return evicted;
}

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

function missingApiKeyMessage(): string {
  return (
    'Missing VerifyAX API key. Send Authorization: Bearer sk-ver-api-... ' +
    '(or X-VerifyAX-API-Key) on every request.'
  );
}

export function registerStreamableHttpRoutes(
  app: ReturnType<typeof createMcpExpressApp>,
  logger: ReturnType<typeof createLogger>,
  env: NodeJS.ProcessEnv,
  options: StreamableHttpOptions = {}
): Map<string, McpSession> {
  const sessions = new Map<string, McpSession>();
  const validateApiKey = options.validateApiKey ?? defaultValidateApiKey;
  const now = options.now ?? (() => Date.now());
  const rateState = new Map<string, { count: number; windowStartMs: number }>();

  /** Fixed-window per-key rate limit. Returns true when the request is allowed. */
  const allowRate = (keyHash: string): boolean => {
    const ts = now();
    const state = rateState.get(keyHash);
    if (!state || ts - state.windowStartMs >= RATE_WINDOW_MS) {
      rateState.set(keyHash, { count: 1, windowStartMs: ts });
      return true;
    }
    state.count += 1;
    return state.count <= RATE_MAX_REQUESTS;
  };

  /** Authorize a request against an existing session (key must match). */
  const authorizeExisting = (req: Request, res: Response, session: McpSession): boolean => {
    const key = readApiKeyFromRequest(req);
    if (!key) {
      jsonRpcError(res, 401, missingApiKeyMessage());
      return false;
    }
    if (!keyMatchesHash(key, session.keyHash)) {
      jsonRpcError(res, 403, 'The API key does not match this session.');
      return false;
    }
    if (!allowRate(session.keyHash)) {
      jsonRpcError(res, 429, 'Rate limit exceeded. Slow down and retry shortly.');
      return false;
    }
    session.lastSeenMs = now();
    return true;
  };

  const postHandler = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.headers['mcp-session-id'];
    const sessionKey = typeof sessionId === 'string' ? sessionId : undefined;

    try {
      const existing = sessionKey ? sessions.get(sessionKey) : undefined;
      if (existing) {
        if (!authorizeExisting(req, res, existing)) {
          return;
        }
        await existing.transport.handleRequest(req, res, req.body);
        return;
      }

      if (isInitializeRequest(req.body)) {
        const apiKey = readApiKeyFromRequest(req);
        if (!apiKey) {
          jsonRpcError(res, 401, missingApiKeyMessage());
          return;
        }
        const keyHash = hashApiKey(apiKey);
        if (!allowRate(keyHash)) {
          jsonRpcError(res, 429, 'Rate limit exceeded. Slow down and retry shortly.');
          return;
        }

        const ctx = createToolContextFromApiKey(apiKey, logger, env);

        // Reject invalid keys up front so a random string cannot mint a session.
        try {
          await validateApiKey(ctx);
        } catch (error: unknown) {
          if (error instanceof AuthError) {
            jsonRpcError(res, 401, 'The VerifyAX API key was rejected by the gateway.');
            return;
          }
          logger.error('api key validation could not complete', {
            error: error instanceof Error ? error.message : String(error),
          });
          jsonRpcError(res, 503, 'Could not validate the API key right now. Try again shortly.');
          return;
        }

        // Cap concurrent sessions (sweep idle ones first).
        if (sessions.size >= MAX_SESSIONS) {
          sweepIdleSessions(sessions, now(), SESSION_IDLE_TTL_MS, logger);
          if (sessions.size >= MAX_SESSIONS) {
            jsonRpcError(res, 503, 'Server at capacity. Try again shortly.');
            return;
          }
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, ctx, keyHash, lastSeenMs: now() });
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            sessions.delete(sid);
          }
        };

        const server = createServer(ctx);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      jsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
    } catch (error: unknown) {
      logger.error('streamable-http request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        jsonRpcError(res, 500, 'Internal server error');
      }
    }
  };

  const sessionHandler = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.headers['mcp-session-id'];
    const sessionKey = typeof sessionId === 'string' ? sessionId : undefined;
    const session = sessionKey ? sessions.get(sessionKey) : undefined;
    if (!session) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    if (!authorizeExisting(req, res, session)) {
      return;
    }
    await session.transport.handleRequest(req, res, req.method === 'POST' ? req.body : undefined);
  };

  app.post(MCP_PATH, postHandler);
  app.get(MCP_PATH, sessionHandler);
  app.delete(MCP_PATH, sessionHandler);

  return sessions;
}

async function closeSessions(sessions: Map<string, McpSession>): Promise<void> {
  for (const session of sessions.values()) {
    await session.transport.close();
  }
  sessions.clear();
}

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const logger = createLogger();
  const host = resolveHost(env);
  const port = resolvePort(env);
  const allowedHosts = resolveAllowedHosts(env);
  assertHostBinding(host, allowedHosts);

  const app = createMcpExpressApp({ host, allowedHosts });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  const sessions = registerStreamableHttpRoutes(app, logger, env);
  const sweeper = setInterval(() => {
    sweepIdleSessions(sessions, Date.now(), SESSION_IDLE_TTL_MS, logger);
  }, SESSION_SWEEP_INTERVAL_MS);
  sweeper.unref();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      logger.info('verifyax-mcp-server-http started', { host, port, path: MCP_PATH });
      resolve();
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.info('shutting down', { signal });
      clearInterval(sweeper);
      await closeSessions(sessions);
      await new Promise<void>((closeResolve, closeReject) => {
        server.close((closeError?: Error) => {
          if (closeError) {
            closeReject(closeError);
            return;
          }
          closeResolve();
        });
      });
      process.exit(0);
    };

    process.on('SIGINT', () => {
      shutdown('SIGINT').catch(reportFatal);
    });
    process.on('SIGTERM', () => {
      shutdown('SIGTERM').catch(reportFatal);
    });
  });
}

if (isMainModule(import.meta.url)) {
  main().catch(reportFatal);
}
