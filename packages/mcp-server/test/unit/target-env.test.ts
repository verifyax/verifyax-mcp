import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_API_BASE_URL,
  PRODUCTION_WEB_BASE_URL,
  assertTargetEnvironment,
  parseMcpTargetEnvironment,
} from '../../src/target-env.js';

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

describe('assertTargetEnvironment', () => {
  it('allows production and unset profiles without overrides', () => {
    expect(() => assertTargetEnvironment({})).not.toThrow();
    expect(() => assertTargetEnvironment({ VERIFYAX_MCP_TARGET_ENV: 'production' })).not.toThrow();
  });

  it('refuses development without non-production base URLs', () => {
    expect(() => assertTargetEnvironment({ VERIFYAX_MCP_TARGET_ENV: 'development' })).toThrow(
      /VERIFYAX_BASE_URL/
    );
  });

  it('refuses testing when base URLs still point at production', () => {
    expect(() =>
      assertTargetEnvironment({
        VERIFYAX_MCP_TARGET_ENV: 'testing',
        VERIFYAX_BASE_URL: PRODUCTION_API_BASE_URL,
        VERIFYAX_WEB_BASE_URL: PRODUCTION_WEB_BASE_URL,
      })
    ).toThrow(/production/);
  });

  it('allows development with non-production base URLs', () => {
    expect(() =>
      assertTargetEnvironment({
        VERIFYAX_MCP_TARGET_ENV: 'development',
        VERIFYAX_BASE_URL: 'https://dev.example.com/api/v1',
        VERIFYAX_WEB_BASE_URL: 'https://dev.example.com/web/api/v1',
      })
    ).not.toThrow();
  });
});
