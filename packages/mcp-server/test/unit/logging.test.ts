import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/logging.js';

function capture(level: 'debug' | 'info' | 'warn' | 'error' | 'silent') {
  const lines: string[] = [];
  const logger = createLogger({ level, write: (line) => lines.push(line) });
  return { logger, lines };
}

describe('createLogger', () => {
  it('emits structured JSON with level and message', () => {
    const { logger, lines } = capture('debug');
    logger.info('hello', { foo: 'bar' });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('hello');
    expect(entry.foo).toBe('bar');
    expect(typeof entry.time).toBe('string');
  });

  it('suppresses entries below the configured level', () => {
    const { logger, lines } = capture('warn');
    logger.info('skipped');
    logger.debug('skipped');
    logger.warn('kept');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}').msg).toBe('kept');
  });

  it('silent suppresses everything', () => {
    const { logger, lines } = capture('silent');
    logger.error('nope');
    expect(lines).toHaveLength(0);
  });

  it('redacts secret-bearing fields and embedded API keys (ARCH-3)', () => {
    const { logger, lines } = capture('debug');
    logger.info('request', {
      authorization: 'Bearer sk-ver-api-supersecret',
      token: 'sk-ver-api-anothersecret',
      nested: { basic_password: 'hunter2', note: 'used key sk-ver-api-embedded123 here' },
      safe: 'ok',
    });
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(entry.authorization).toBe('[redacted]');
    expect(entry.token).toBe('[redacted]');
    const nested = entry.nested as Record<string, unknown>;
    expect(nested.basic_password).toBe('[redacted]');
    expect(nested.note).toBe('used key sk-ver-*** here');
    expect(entry.safe).toBe('ok');
    // No raw key material survives anywhere in the serialized line.
    expect(lines[0]).not.toContain('supersecret');
    expect(lines[0]).not.toContain('embedded123');
  });
});
