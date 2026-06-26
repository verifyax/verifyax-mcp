#!/usr/bin/env node
// HTTP entry point (bin: verifyax-mcp-server-http).
// Serves MCP over Streamable HTTP. Each client sends its own VerifyAX API key per session.

import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
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

export interface McpSession {
  transport: StreamableHTTPServerTransport;
  ctx: ToolContext;
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

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  });
}

function missingApiKeyMessage(): string {
  return (
    'Missing VerifyAX API key. Send Authorization: Bearer sk-ver-api-... ' +
    'or X-VerifyAX-API-Key on the initialize request.'
  );
}

export function registerStreamableHttpRoutes(
  app: ReturnType<typeof createMcpExpressApp>,
  logger: ReturnType<typeof createLogger>,
  env: NodeJS.ProcessEnv
): Map<string, McpSession> {
  const sessions = new Map<string, McpSession>();

  const postHandler = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.headers['mcp-session-id'];
    const sessionKey = typeof sessionId === 'string' ? sessionId : undefined;

    try {
      if (sessionKey && sessions.has(sessionKey)) {
        const session = sessions.get(sessionKey);
        if (!session) {
          jsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
          return;
        }
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (isInitializeRequest(req.body)) {
        const apiKey = readApiKeyFromRequest(req);
        if (!apiKey) {
          jsonRpcError(res, 401, missingApiKeyMessage());
          return;
        }

        const ctx = createToolContextFromApiKey(apiKey, logger, env);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, ctx });
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
    if (!sessionKey || !sessions.has(sessionKey)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const session = sessions.get(sessionKey);
    if (!session) {
      res.status(400).send('Invalid or missing session ID');
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

  const app = createMcpExpressApp({ host, allowedHosts });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', transport: 'streamable-http' });
  });

  const sessions = registerStreamableHttpRoutes(app, logger, env);

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      logger.info('verifyax-mcp-server-http started', {
        host,
        port,
        path: MCP_PATH,
      });
      resolve();
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.info('shutting down', { signal });
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
