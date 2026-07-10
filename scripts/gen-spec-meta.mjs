// Record provenance for the SDK's OpenAPI spec mirror.
//
// Writes packages/sdk/openapi/verifyax.meta.json with the spec's declared
// `info.version` and a content hash, so the SDK carries a visible record of
// which canonical spec version its generated types derive from. Mirrors the
// sidecar that verifyax-agent-integrations emits, enabling cross-surface
// spec-version parity checks.
//
// The hash is taken over LF-normalized bytes so it is identical regardless of
// the platform's line-ending checkout (the CI staleness gate runs on Linux; the
// committed file may be written on Windows).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIRROR = join(ROOT, 'packages/sdk/openapi/verifyax.yaml');
const OUT = join(ROOT, 'packages/sdk/openapi/verifyax.meta.json');
const SOURCE_URL = 'https://console.verifyax.com/openapi.yaml';

/** Pull `info.version` out of the spec without a YAML dependency. */
function specVersion(text) {
  const lines = text.split(/\r?\n/);
  let inInfo = false;
  for (const line of lines) {
    if (/^info:\s*$/.test(line)) {
      inInfo = true;
      continue;
    }
    if (inInfo) {
      // A new top-level key ends the info block.
      if (/^\S/.test(line)) break;
      const m = line.match(/^\s+version:\s*["']?([^"'\s]+)["']?\s*$/);
      if (m) return m[1];
    }
  }
  throw new Error('could not find info.version in the spec mirror');
}

const raw = readFileSync(MIRROR, 'utf8');
const normalized = raw.replace(/\r\n/g, '\n');
const meta = {
  source: SOURCE_URL,
  spec_version: specVersion(raw),
  spec_sha256: createHash('sha256').update(normalized, 'utf8').digest('hex'),
};

// Stable key order + trailing newline so the file is diff-friendly.
writeFileSync(OUT, JSON.stringify(meta, null, 2) + '\n');
console.log(`gen-spec-meta: ${OUT} (spec ${meta.spec_version})`);
