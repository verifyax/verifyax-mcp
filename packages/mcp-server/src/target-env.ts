// Guards against dev/test convenience scripts silently targeting production.

import { VerifyaxError } from '@verifyax/sdk';
import {
  checkNonProductionBaseUrls,
  nonProductionEnvFileName,
  parseMcpTargetEnvironment,
} from './target-env-guard.js';

export {
  MCP_TARGET_ENVIRONMENTS,
  PRODUCTION_API_BASE_URL,
  PRODUCTION_WEB_BASE_URL,
  parseMcpTargetEnvironment,
  type McpTargetEnvironment,
} from './target-env-guard.js';

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
  const check = checkNonProductionBaseUrls(env);

  if (check.ok) {
    return;
  }

  if (check.reason === 'missing') {
    throw new VerifyaxError(
      `Refusing to start: VERIFYAX_MCP_TARGET_ENV is "${target}" but VERIFYAX_BASE_URL and ` +
        `VERIFYAX_WEB_BASE_URL are not set. Create packages/mcp-server/${envFile} from .env.example ` +
        `with your non-production gateway URLs, then rerun the start:${target === 'development' ? 'dev' : 'test'} script.`
    );
  }

  throw new VerifyaxError(
    `Refusing to start: VERIFYAX_MCP_TARGET_ENV is "${target}" but base URLs still point at ` +
      `production (console.verifyax.com). Update packages/mcp-server/${envFile} with your ` +
      `development or testing gateway URLs.`
  );
}
