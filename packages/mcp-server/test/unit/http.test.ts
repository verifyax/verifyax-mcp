import { describe, expect, it } from 'vitest';
import { readApiKeyFromRequest } from '../../src/auth.js';
import { resolveAllowedHosts, resolveHost, resolvePort } from '../../src/http.js';

describe('readApiKeyFromRequest', () => {
  it('reads Bearer authorization', () => {
    expect(
      readApiKeyFromRequest({ headers: { authorization: 'Bearer sk-ver-api-abc' } })
    ).toBe('sk-ver-api-abc');
  });

  it('reads X-VerifyAX-API-Key header', () => {
    expect(
      readApiKeyFromRequest({ headers: { 'x-verifyax-api-key': 'sk-ver-api-xyz' } })
    ).toBe('sk-ver-api-xyz');
  });

  it('returns undefined when no key is present', () => {
    expect(readApiKeyFromRequest({ headers: {} })).toBeUndefined();
    expect(readApiKeyFromRequest({ headers: { authorization: 'Basic x' } })).toBeUndefined();
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
