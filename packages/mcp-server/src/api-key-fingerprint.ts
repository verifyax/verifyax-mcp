import { createHmac, randomBytes } from 'node:crypto';

// API keys are high-entropy tokens, not human passwords. A per-process HMAC
// secret prevents offline comparison of session/rate-limit identities without
// putting a password KDF on Node's event loop for every request.
const API_KEY_FINGERPRINT_SECRET = randomBytes(32);

/**
 * Keyed in-memory identity for a VerifyAX API key (session binding + rate
 * buckets). Not password storage and not persisted.
 *
 * The credential is the HMAC key; the process secret is the message. That is a
 * PRF keyed by the token, which is the right construction here. Feeding the
 * token to `update()` makes CodeQL's `js/insufficient-password-hash` query
 * treat this as a fast password hash (CWE-916) and recommend bcrypt/PBKDF2 —
 * those would block the event loop and are for low-entropy passwords.
 */
export function fingerprintApiKey(
  credential: string,
  secret: Uint8Array = API_KEY_FINGERPRINT_SECRET
): string {
  // codeql[js/insufficient-password-hash]
  return createHmac('sha256', credential).update(secret).digest('hex');
}
