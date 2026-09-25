import { VerifyaxError } from '@verifyax/sdk';
import { describe, expect, it } from 'vitest';
import { readApiKey, readApiKeyFromRequest } from '../../src/auth.js';

describe('readApiKey', () => {
  it('returns a trimmed key', () => {
    expect(readApiKey({ VERIFYAX_API_KEY: '  sk-ver-api-abc  ' })).toBe('sk-ver-api-abc');
  });

  it('throws a typed, actionable error when missing', () => {
    expect(() => readApiKey({})).toThrow(VerifyaxError);
    expect(() => readApiKey({})).toThrow(/VERIFYAX_API_KEY is not set/);
  });

  it('treats an empty/whitespace value as missing', () => {
    expect(() => readApiKey({ VERIFYAX_API_KEY: '   ' })).toThrow(VerifyaxError);
  });
});

describe('readApiKeyFromRequest', () => {
  const req = (headers: Record<string, string | undefined>) =>
    ({ headers }) as unknown as Parameters<typeof readApiKeyFromRequest>[0];

  it('reads a Bearer token', () => {
    expect(readApiKeyFromRequest(req({ authorization: 'Bearer sk-ver-api-abc' }))).toBe(
      'sk-ver-api-abc'
    );
  });

  // RFC 9110 §11.1: auth-scheme is a case-insensitive token. A client that
  // normalises the scheme was previously rejected with "Missing VerifyAX API key",
  // which sent people looking for an absent header rather than a casing mismatch.
  it.each(['bearer', 'BEARER', 'BeArEr'])('accepts the scheme spelled %s', (scheme) => {
    expect(readApiKeyFromRequest(req({ authorization: `${scheme} sk-ver-api-abc` }))).toBe(
      'sk-ver-api-abc'
    );
  });

  it('tolerates extra whitespace after the scheme', () => {
    expect(readApiKeyFromRequest(req({ authorization: 'Bearer    sk-ver-api-abc  ' }))).toBe(
      'sk-ver-api-abc'
    );
  });

  it('reads the X-VerifyAX-API-Key header', () => {
    expect(readApiKeyFromRequest(req({ 'x-verifyax-api-key': '  sk-ver-api-xyz ' }))).toBe(
      'sk-ver-api-xyz'
    );
  });

  it('prefers Authorization over X-VerifyAX-API-Key', () => {
    expect(
      readApiKeyFromRequest(
        req({ authorization: 'Bearer sk-ver-api-abc', 'x-verifyax-api-key': 'sk-ver-api-xyz' })
      )
    ).toBe('sk-ver-api-abc');
  });

  it('falls through to X-VerifyAX-API-Key when the Bearer token is empty', () => {
    expect(
      readApiKeyFromRequest(
        req({ authorization: 'Bearer   ', 'x-verifyax-api-key': 'sk-ver-api-xyz' })
      )
    ).toBe('sk-ver-api-xyz');
  });

  it.each([
    ['no headers', {}],
    ['a non-Bearer scheme', { authorization: 'Basic c2s6c2s=' }],
    ['a scheme with no token', { authorization: 'Bearer' }],
    ['an empty X-VerifyAX-API-Key', { 'x-verifyax-api-key': '   ' }],
  ])('returns undefined for %s', (_label, headers) => {
    expect(readApiKeyFromRequest(req(headers as Record<string, string>))).toBeUndefined();
  });
});
