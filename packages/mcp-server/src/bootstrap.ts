// Shared startup wiring for stdio and HTTP entry points.

import { VerifyaxClient, type VerifyaxClientOptions } from '@verifyax/sdk';
import { readApiKey } from './auth.js';
import { createLogger, type Logger } from './logging.js';
import type { ToolContext } from './tools/context.js';

export function buildVerifyaxClientOptions(
  apiKey: string,
  env: NodeJS.ProcessEnv = process.env
): VerifyaxClientOptions {
  const options: VerifyaxClientOptions = { apiKey };
  const baseUrl = env.VERIFYAX_BASE_URL;
  if (baseUrl) {
    options.baseUrl = baseUrl;
  }
  const webBaseUrl = env.VERIFYAX_WEB_BASE_URL;
  if (webBaseUrl) {
    options.webBaseUrl = webBaseUrl;
  }
  return options;
}

/** Build tool context for stdio mode (API key from env). */
export function createToolContext(env: NodeJS.ProcessEnv = process.env): ToolContext {
  const logger = createLogger();
  const client = new VerifyaxClient(buildVerifyaxClientOptions(readApiKey(env), env));
  return { client, logger };
}

/** Build tool context for HTTP mode (API key supplied by the MCP client per session). */
export function createToolContextFromApiKey(
  apiKey: string,
  logger: Logger,
  env: NodeJS.ProcessEnv = process.env
): ToolContext {
  const client = new VerifyaxClient(buildVerifyaxClientOptions(apiKey, env));
  return { client, logger };
}

export function reportFatal(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'fatal', error: message })}\n`);
  process.exit(1);
}
