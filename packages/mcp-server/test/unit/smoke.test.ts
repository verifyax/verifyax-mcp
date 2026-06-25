import { VerifyaxClient } from '@verifyax/sdk';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/logging.js';
import { SERVER_NAME, createServer } from '../../src/server.js';

describe('@verifyax/mcp-server', () => {
  it('builds a server with tools registered (no I/O)', () => {
    const server = createServer({
      client: new VerifyaxClient({ apiKey: 'unused-in-this-test' }),
      logger: createLogger({ level: 'silent' }),
    });
    expect(server).toBeDefined();
    expect(SERVER_NAME).toBe('verifyax-mcp-server');
  });
});
