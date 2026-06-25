import { VerifyaxClient, type VerifyaxClientOptions } from '../src/index.js';
import { API_BASE, WEB_BASE } from './server.js';

/** A client pointed at the mock bases, with a short timeout for fast tests. */
export function makeClient(overrides: Partial<VerifyaxClientOptions> = {}): VerifyaxClient {
  return new VerifyaxClient({
    apiKey: 'test-key',
    baseUrl: API_BASE,
    webBaseUrl: WEB_BASE,
    timeoutMs: 1_000,
    ...overrides,
  });
}
