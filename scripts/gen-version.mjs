#!/usr/bin/env node
// Generate each package's src/version.ts from its package.json `version`, so the
// version lives in exactly one place. Run before tsc (wired into the root `build`
// script); the smoke tests assert the generated constant matches package.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['sdk', 'mcp-server'];

for (const pkg of packages) {
  const pkgDir = join(repoRoot, 'packages', pkg);
  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  if (typeof version !== 'string') {
    throw new TypeError(`packages/${pkg}/package.json has no string version`);
  }
  const out = join(pkgDir, 'src', 'version.ts');
  const body =
    `// Generated from package.json by scripts/gen-version.mjs. Do not edit by hand.\n` +
    `export const VERSION = '${version}';\n`;
  // Only write when changed, to avoid needless mtime churn / rebuilds.
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* file does not exist yet */
  }
  if (current !== body) {
    writeFileSync(out, body);
    console.error(`gen-version: wrote packages/${pkg}/src/version.ts (${version})`);
  } else {
    console.error(`gen-version: packages/${pkg}/src/version.ts already ${version}`);
  }
}
