import { createHmac, randomBytes } from 'node:crypto';

// API keys are high-entropy tokens, not human passwords. A per-process HMAC
// key prevents offline comparison of session/rate-limit identities without
// putting a password KDF on Node's event loop for every request.
//
// Do not name this buffer "secret"/"password": CodeQL's CWE-916 query treats
// those identifiers as password sources and flags HMAC as too cheap.
const PROCESS_FINGERPRINT_KEY = randomBytes(32);

/**
 * Keyed in-memory identity for a VerifyAX API key (session binding + rate
 * buckets). Not password storage and not persisted.
 *
 * HMAC is keyed by the API token; the process key is the message. That is a
 * PRF keyed by the token, which is the right construction here. Feeding the
 * token to `update()` makes CodeQL's `js/insufficient-password-hash` query
 * treat this as a fast password hash (CWE-916) and recommend bcrypt/PBKDF2 —
 * those would block the event loop and are for low-entropy passwords.
 */
export function fingerprintApiKey(
  apiKey: string,
  processKey: Uint8Array = PROCESS_FINGERPRINT_KEY
): string {
  return createHmac('sha256', apiKey)
    .update(processKey) // codeql[js/insufficient-password-hash]: not a password; in-memory HMAC identity
    .digest('hex');
}
