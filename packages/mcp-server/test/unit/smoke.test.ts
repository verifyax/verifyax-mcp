import { readFileSync } from 'node:fs';
import { VerifyaxClient } from '@verifyax/sdk';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/logging.js';
import { SERVER_NAME, SERVER_VERSION, createServer } from '../../src/server.js';

function readPackageVersion(): string {
  const packageJson: unknown = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  );
  if (
    typeof packageJson !== 'object' ||
    packageJson === null ||
    !('version' in packageJson) ||
    typeof packageJson.version !== 'string'
  ) {
    throw new TypeError('Expected package.json to contain a string version.');
  }
  return packageJson.version;
}

describe('@verifyax/mcp-server', () => {
  it('builds a server with tools registered (no I/O)', () => {
    const server = createServer({
      client: new VerifyaxClient({ apiKey: 'unused-in-this-test' }),
      logger: createLogger({ level: 'silent' }),
    });
    expect(server).toBeDefined();
    expect(SERVER_NAME).toBe('verifyax-mcp-server');
    expect(SERVER_VERSION).toBe(readPackageVersion());
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
