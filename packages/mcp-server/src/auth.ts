// Reads the VerifyAX API key from the environment (CLAUDE.md: API-key auth only in v1).
// Throws a typed VerifyaxError with an actionable message when it is missing.

import { VerifyaxError } from '@verifyax/sdk';

export function readApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.VERIFYAX_API_KEY?.trim();
  if (!key) {
    throw new VerifyaxError(
      'VERIFYAX_API_KEY is not set. Add your VerifyAX API key to the MCP server configuration ' +
        '(env: { "VERIFYAX_API_KEY": "sk-ver-api-..." }). Get a key from Settings → API Keys in the VerifyAX console.'
    );
  }
  return key;
}
