import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_API_BASE_URL,
  PRODUCTION_WEB_BASE_URL,
  checkNonProductionBaseUrls,
  nonProductionEnvFileName,
  parseMcpTargetEnvironment,
  requiresNonProductionBaseUrls,
} from '../../src/target-env-guard.js';

describe('parseMcpTargetEnvironment', () => {
  it('accepts known profiles', () => {
    expect(parseMcpTargetEnvironment('production')).toBe('production');
    expect(parseMcpTargetEnvironment('development')).toBe('development');
    expect(parseMcpTargetEnvironment('testing')).toBe('testing');
  });

  it('rejects unknown values', () => {
    expect(parseMcpTargetEnvironment(undefined)).toBeUndefined();
    expect(parseMcpTargetEnvironment('staging')).toBeUndefined();
  });
});

describe('requiresNonProductionBaseUrls', () => {
  it('is true only for development and testing', () => {
    expect(requiresNonProductionBaseUrls('development')).toBe(true);
    expect(requiresNonProductionBaseUrls('testing')).toBe(true);
    expect(requiresNonProductionBaseUrls('production')).toBe(false);
  });
});

describe('nonProductionEnvFileName', () => {
  it('maps profiles to env files', () => {
    expect(nonProductionEnvFileName('development')).toBe('.env.dev');
    expect(nonProductionEnvFileName('testing')).toBe('.env.test');
  });
});

describe('checkNonProductionBaseUrls', () => {
  it('rejects missing base URLs', () => {
    expect(checkNonProductionBaseUrls({})).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects production base URLs', () => {
    expect(
      checkNonProductionBaseUrls({
        VERIFYAX_BASE_URL: PRODUCTION_API_BASE_URL,
        VERIFYAX_WEB_BASE_URL: PRODUCTION_WEB_BASE_URL,
      })
    ).toEqual({ ok: false, reason: 'production' });
  });

  it('accepts non-production base URLs', () => {
    expect(
      checkNonProductionBaseUrls({
        VERIFYAX_BASE_URL: 'https://dev.example.com/api/v1',
        VERIFYAX_WEB_BASE_URL: 'https://dev.example.com/web/api/v1',
      })
    ).toEqual({ ok: true });
  });
});
