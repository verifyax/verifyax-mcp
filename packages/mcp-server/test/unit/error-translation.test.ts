import {
  AuthError,
  ConflictError,
  JobFailedError,
  RateLimitError,
  TimeoutError,
  VerifyaxError,
} from '@verifyax/sdk';
import { describe, expect, it } from 'vitest';
import { translateError } from '../../src/error-translation.js';

describe('translateError', () => {
  it('maps AuthError to an actionable key-check fix', () => {
    const result = translateError(new AuthError('Invalid API key'));
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Authentication failed');
    expect(result.suggested_fix).toContain('VERIFYAX_API_KEY');
  });

  it('maps ConflictError with a dependents hint', () => {
    const result = translateError(new ConflictError('scenario has runs'));
    expect(result.reason).toContain('Conflict');
    expect(result.suggested_fix).toContain('dependents');
  });

  it('includes retryAfter in the RateLimitError fix', () => {
    const result = translateError(new RateLimitError('slow down', { retryAfter: 12 }));
    expect(result.suggested_fix).toContain('12 seconds');
  });

  it('surfaces JobFailedError error_details in the reason', () => {
    const result = translateError(
      new JobFailedError('failed', {
        jobUuid: 'j1',
        jobStatus: 'FAILED',
        errorDetails: 'tags do not exist in the skill tags registry',
      })
    );
    expect(result.reason).toContain('skill tags registry');
    expect(result.reason).toContain('FAILED');
  });

  it('reports the deadline for TimeoutError', () => {
    const result = translateError(new TimeoutError('too slow', { timeoutMs: 5000 }));
    expect(result.reason).toContain('5000ms');
  });

  it('passes a generic VerifyaxError message through without a fix', () => {
    const result = translateError(new VerifyaxError('boom'));
    expect(result.reason).toBe('boom');
    expect(result.suggested_fix).toBeUndefined();
  });

  it('handles unknown errors defensively', () => {
    expect(translateError('weird').reason).toContain('Unexpected error');
    expect(translateError(new Error('plain')).reason).toContain('plain');
  });
});
