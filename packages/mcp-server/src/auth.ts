// Reads the VerifyAX API key from the environment (stdio) or HTTP request headers (Streamable HTTP).

import type { Request } from 'express';
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

/**
 * Read a VerifyAX API key from an HTTP request.
 * Accepts `Authorization: Bearer sk-ver-api-...` or `X-VerifyAX-API-Key: sk-ver-api-...`.
 *
 * The scheme is matched case-insensitively: RFC 9110 §11.1 defines auth-scheme as a
 * case-insensitive token, so `bearer` and `BEARER` are as valid as `Bearer`, and a client
 * that normalises the scheme would otherwise be rejected with a misleading
 * "Missing VerifyAX API key". Header *names* are already case-insensitive via Node,
 * which lowercases them before they reach `req.headers`.
 */
const BEARER_PREFIX = /^Bearer[ \t]+/i;

export function readApiKeyFromRequest(req: Pick<Request, 'headers'>): string | undefined {
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') {
    const match = BEARER_PREFIX.exec(authorization);
    if (match) {
      const key = authorization.slice(match[0].length).trim();
      if (key.length > 0) {
        return key;
      }
    }
  }

  const header = req.headers['x-verifyax-api-key'];
  if (typeof header === 'string') {
    const key = header.trim();
    if (key.length > 0) {
      return key;
    }
  }

  return undefined;
}
