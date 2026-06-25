import { describe, expect, it } from 'vitest';
import { SDK_VERSION } from '../../src/index.js';

describe('@verifyax/sdk', () => {
  it('exposes a semver-shaped version', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
