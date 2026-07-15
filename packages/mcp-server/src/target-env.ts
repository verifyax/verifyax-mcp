// Guards against dev/test convenience scripts silently targeting production.

import { VerifyaxError } from '@verifyax/sdk';

export const PRODUCTION_API_BASE_URL = 'https://console.verifyax.com/api/v1' as const;
export const PRODUCTION_WEB_BASE_URL = 'https://console.verifyax.com/web/api/v1' as const;

export const MCP_TARGET_ENVIRONMENTS = ['production', 'development', 'testing'] as const;
export type McpTargetEnvironment = (typeof MCP_TARGET_ENVIRONMENTS)[number];

export function parseMcpTargetEnvironment(
  raw: string | undefined
): McpTargetEnvironment | undefined {
  switch (raw) {
    case 'production':
    case 'development':
    case 'testing':
      return raw;
    default:
      return undefined;
  }
}

function nonProductionEnvFileName(target: McpTargetEnvironment): string {
  return target === 'development' ? '.env.dev' : '.env.test';
}

/**
 * When VERIFYAX_MCP_TARGET_ENV is development or testing (set by convenience
 * scripts), refuse to start unless non-production base URLs are configured.
 */
export function assertTargetEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const target = parseMcpTargetEnvironment(env.VERIFYAX_MCP_TARGET_ENV);
  if (target !== 'development' && target !== 'testing') {
    return;
  }

  const envFile = nonProductionEnvFileName(target);
  const baseUrl = env.VERIFYAX_BASE_URL?.trim();
  const webBaseUrl = env.VERIFYAX_WEB_BASE_URL?.trim();

  if (!baseUrl || !webBaseUrl) {
    throw new VerifyaxError(
      `Refusing to start: VERIFYAX_MCP_TARGET_ENV is "${target}" but VERIFYAX_BASE_URL and ` +
        `VERIFYAX_WEB_BASE_URL are not set. Create packages/mcp-server/${envFile} from .env.example ` +
        `with your non-production gateway URLs, then rerun the start:${target === 'development' ? 'dev' : 'test'} script.`
    );
  }

  if (baseUrl === PRODUCTION_API_BASE_URL || webBaseUrl === PRODUCTION_WEB_BASE_URL) {
    throw new VerifyaxError(
      `Refusing to start: VERIFYAX_MCP_TARGET_ENV is "${target}" but base URLs still point at ` +
        `production (console.verifyax.com). Update packages/mcp-server/${envFile} with your ` +
        `development or testing gateway URLs.`
    );
  }
}
