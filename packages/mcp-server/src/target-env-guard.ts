// Shared dev/test guards: production base URLs and non-production profile checks.

export const PRODUCTION_API_BASE_URL = 'https://console.verifyax.com/api/v1' as const;
export const PRODUCTION_WEB_BASE_URL = 'https://console.verifyax.com/web/api/v1' as const;

export const MCP_TARGET_ENVIRONMENTS = ['production', 'development', 'testing'] as const;
export type McpTargetEnvironment = (typeof MCP_TARGET_ENVIRONMENTS)[number];

export type NonProductionProfile = 'development' | 'testing';

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

export function requiresNonProductionBaseUrls(
  profile: McpTargetEnvironment | string
): profile is NonProductionProfile {
  return profile === 'development' || profile === 'testing';
}

export function nonProductionEnvFileName(target: NonProductionProfile): string {
  return target === 'development' ? '.env.dev' : '.env.test';
}

export type NonProductionBaseUrlCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'production' };

/** Validate VERIFYAX_*_BASE_URL values for development/testing profiles. */
export function checkNonProductionBaseUrls(env: {
  VERIFYAX_BASE_URL?: string;
  VERIFYAX_WEB_BASE_URL?: string;
}): NonProductionBaseUrlCheck {
  const baseUrl = env.VERIFYAX_BASE_URL?.trim();
  const webBaseUrl = env.VERIFYAX_WEB_BASE_URL?.trim();

  if (!baseUrl || !webBaseUrl) {
    return { ok: false, reason: 'missing' };
  }

  if (baseUrl === PRODUCTION_API_BASE_URL || webBaseUrl === PRODUCTION_WEB_BASE_URL) {
    return { ok: false, reason: 'production' };
  }

  return { ok: true };
}
