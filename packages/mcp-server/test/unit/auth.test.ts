import { VerifyaxError } from '@verifyax/sdk';
import { describe, expect, it } from 'vitest';
import { readApiKey } from '../../src/auth.js';

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
