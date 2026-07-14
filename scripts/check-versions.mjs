#!/usr/bin/env node
// Assert the version is identical across every place it is hand-maintained, so a
// partial bump can't ship a mismatched set (SDK, MCP server, and both fields in
// the MCP-registry server.json). When run on a tag build, also assert the tag
// matches (set EXPECT_VERSION to the tag name, e.g. v0.2.1).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/** @param {string} rel */
function readGeneratedVersion(rel) {
  const content = readFileSync(join(root, rel), 'utf8');
  const match = content.match(/export const VERSION = '([^']+)';/);
  if (!match) {
    throw new Error(`Could not parse VERSION from ${rel}`);
  }
  return match[1];
}

const versions = {
  'packages/sdk/package.json': read('packages/sdk/package.json').version,
  'packages/mcp-server/package.json': read('packages/mcp-server/package.json').version,
  'packages/sdk/src/version.ts': readGeneratedVersion('packages/sdk/src/version.ts'),
  'packages/mcp-server/src/version.ts': readGeneratedVersion(
    'packages/mcp-server/src/version.ts'
  ),
};

const serverJson = read('server.json');
versions['server.json → version'] = serverJson.version;
for (const pkg of serverJson.packages ?? []) {
  versions[`server.json → packages[${pkg.identifier}].version`] = pkg.version;
}

const unique = [...new Set(Object.values(versions))];
if (unique.length !== 1) {
  console.error('Version mismatch across files:');
  for (const [file, version] of Object.entries(versions)) {
    console.error(`  ${version}\t${file}`);
  }
  process.exit(1);
}

const version = unique[0];
const expected = process.env.EXPECT_VERSION?.trim().replace(/^v/, '');
if (expected && expected !== version) {
  console.error(`Tag ${process.env.EXPECT_VERSION} does not match the package version ${version}.`);
  process.exit(1);
}

console.error(
  `OK: all versions agree at ${version}${expected ? ' (matches the pushed tag)' : ''}.`
);
