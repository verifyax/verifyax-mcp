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

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthError } from '@verifyax/sdk';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { readApiKeyFromRequest } from './auth.js';
import { createToolContextFromApiKey, reportFatal } from './bootstrap.js';
import { assertTargetEnvironment } from './target-env.js';
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
/** New session attempts allowed per direct network peer. */
const PRE_AUTH_RATE_MAX_REQUESTS = 60;

export interface McpSession {
  transport: StreamableHTTPServerTransport;
  ctx: ToolContext;
  /** Keyed fingerprint of the API key that created the session. */
  keyFingerprint: string;
  lastSeenMs: number;
}

/** Validates that an API key is real before a session is minted. */
export type ApiKeyValidator = (ctx: ToolContext) => Promise<void>;

export interface StreamableHttpOptions {
  /** Override the session-creation key validation (tests inject a no-op). */
  validateApiKey?: ApiKeyValidator;
  /** Clock, for tests. */
  now?: () => number;
  /** Override the initialize limiter threshold (tests only). */
  preAuthRateMaxRequests?: number;
}

const defaultValidateApiKey: ApiKeyValidator = async (ctx) => {
  // A cheap authed call — rejects any key the gateway does not accept.
  await ctx.client.usage.getBalance();
};

// API keys are high-entropy credentials, not human passwords. A per-process
// HMAC prevents offline comparison without putting a password KDF on Node's
// event loop for every unauthenticated key.
const API_KEY_FINGERPRINT_SECRET = randomBytes(32);

export function fingerprintApiKey(
  key: string,
  secret: Uint8Array = API_KEY_FINGERPRINT_SECRET
): string {
  // Keyed in-memory session fingerprint, not stored password verification. VerifyAX API keys are
  // high-entropy; the per-process secret is never persisted or logged, so offline cracking requires
  // the secret — stronger than a slow keyless KDF here. Sync PBKDF2/bcrypt/scrypt on this hot
  // path would block the event loop.
  // codeql[js/insufficient-password-hash]
  return createHmac('sha256', secret).update(key, 'utf8').digest('hex');
}

function keyMatchesFingerprint(presentedKey: string, keyFingerprint: string): boolean {
  const presented = Buffer.from(fingerprintApiKey(presentedKey), 'hex');
  const expected = Buffer.from(keyFingerprint, 'hex');
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
export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

export function assertHostBinding(host: string, allowedHosts: string[] | undefined): void {
  if (!isLoopbackHost(host) && (!allowedHosts || allowedHosts.length === 0)) {
    throw new Error(
      `Refusing to bind ${host} without VERIFYAX_MCP_ALLOWED_HOSTS. Set it to the public ` +
        'host(s) that serve /mcp (custom domain + the *.run.app host) so Host-header ' +
        'validation is enabled.'
    );
  }
}

/**
 * Trust one reverse-proxy hop so `req.ip` reflects the client on Cloud Run
 * (otherwise every request shares the proxy's socket address).
 */
export function configureHttpTrustProxy(
  app: ReturnType<typeof createMcpExpressApp>,
  host: string
): void {
  if (!isLoopbackHost(host)) {
    app.set('trust proxy', 1);
  }
}

/** Client address for pre-auth rate limits (proxy-aware when trust proxy is on). */
export function resolveInitializePeer(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
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

/** Drop rate-limit entries whose fixed window has fully elapsed. Returns count removed. */
export function sweepRateState(
  rateState: Map<string, { count: number; windowStartMs: number }>,
  now: number,
  windowMs: number
): number {
  let removed = 0;
  for (const [key, state] of rateState) {
    if (now - state.windowStartMs >= windowMs) {
      rateState.delete(key);
      removed += 1;
    }
  }
  return removed;
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
  // In-flight initialize requests that have passed the cap check but haven't yet
  // registered their session. Counted against the cap to close the init race.
  let pendingInits = 0;
  const validateApiKey = options.validateApiKey ?? defaultValidateApiKey;
  const now = options.now ?? (() => Date.now());
  const rateState = new Map<string, { count: number; windowStartMs: number }>();
  const preAuthRateState = new Map<string, { count: number; windowStartMs: number }>();
  const preAuthRateMaxRequests = options.preAuthRateMaxRequests ?? PRE_AUTH_RATE_MAX_REQUESTS;
  // Reclaim rate-limit entries for keys that fall idle. Bounded to at most one
  // O(n) pass per window so a stream of distinct keys can't grow the map without
  // limit (an entry survives at most ~2 windows past its last request).
  let lastRatePruneMs = now();
  let lastPreAuthRatePruneMs = now();

  /** Fixed-window per-key rate limit. Returns true when the request is allowed. */
  const allowRate = (keyHash: string): boolean => {
    const ts = now();
    if (ts - lastRatePruneMs >= RATE_WINDOW_MS) {
      sweepRateState(rateState, ts, RATE_WINDOW_MS);
      lastRatePruneMs = ts;
    }
    const state = rateState.get(keyHash);
    if (!state || ts - state.windowStartMs >= RATE_WINDOW_MS) {
      rateState.set(keyHash, { count: 1, windowStartMs: ts });
      return true;
    }
    state.count += 1;
    return state.count <= RATE_MAX_REQUESTS;
  };

  /** Limit session initialization by client peer before processing a key. */
  const allowInitialize = (req: Request): boolean => {
    const source = resolveInitializePeer(req);
    const ts = now();
    if (ts - lastPreAuthRatePruneMs >= RATE_WINDOW_MS) {
      sweepRateState(preAuthRateState, ts, RATE_WINDOW_MS);
      lastPreAuthRatePruneMs = ts;
    }
    const state = preAuthRateState.get(source);
    if (!state || ts - state.windowStartMs >= RATE_WINDOW_MS) {
      preAuthRateState.set(source, { count: 1, windowStartMs: ts });
      return true;
    }
    state.count += 1;
    return state.count <= preAuthRateMaxRequests;
  };

  /** Authorize a request against an existing session (key must match). */
  const authorizeExisting = (req: Request, res: Response, session: McpSession): boolean => {
    const key = readApiKeyFromRequest(req);
    if (!key) {
      jsonRpcError(res, 401, missingApiKeyMessage());
      return false;
    }
    if (!keyMatchesFingerprint(key, session.keyFingerprint)) {
      jsonRpcError(res, 403, 'The API key does not match this session.');
      return false;
    }
    if (!allowRate(session.keyFingerprint)) {
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
        if (!allowInitialize(req)) {
          jsonRpcError(res, 429, 'Too many session initialization attempts. Retry shortly.');
          return;
        }
        const apiKey = readApiKeyFromRequest(req);
        if (!apiKey) {
          jsonRpcError(res, 401, missingApiKeyMessage());
          return;
        }
        const keyFingerprint = fingerprintApiKey(apiKey);
        if (!allowRate(keyFingerprint)) {
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

        // Cap concurrent sessions (sweep idle ones first). Count in-flight inits
        // too: without that, a burst of concurrent initialize requests can all
        // pass the check before any registers its session and blow past the cap.
        if (sessions.size + pendingInits >= MAX_SESSIONS) {
          sweepIdleSessions(sessions, now(), SESSION_IDLE_TTL_MS, logger);
          if (sessions.size + pendingInits >= MAX_SESSIONS) {
            jsonRpcError(res, 503, 'Server at capacity. Try again shortly.');
            return;
          }
        }

        // Reserve the slot synchronously (before any await) and release it once
        // the session is registered or the init fails. Idempotent so the map
        // insert and the finally can't double-count.
        pendingInits += 1;
        let reservationHeld = true;
        const releaseReservation = (): void => {
          if (reservationHeld) {
            reservationHeld = false;
            pendingInits -= 1;
          }
        };

        try {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              sessions.set(sid, { transport, ctx, keyFingerprint, lastSeenMs: now() });
              releaseReservation();
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
        } finally {
          // Covers the failure path where onsessioninitialized never fired.
          releaseReservation();
        }
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
  assertTargetEnvironment(env);
  const logger = createLogger();
  const host = resolveHost(env);
  const port = resolvePort(env);
  const allowedHosts = resolveAllowedHosts(env);
  assertHostBinding(host, allowedHosts);

  const app = createMcpExpressApp({ host, allowedHosts });
  configureHttpTrustProxy(app, host);

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
