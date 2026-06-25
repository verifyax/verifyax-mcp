import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SDK_VERSION } from '../../src/index.js';

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

describe('@verifyax/sdk', () => {
  it('exposes the package version', () => {
    expect(SDK_VERSION).toBe(readPackageVersion());
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
