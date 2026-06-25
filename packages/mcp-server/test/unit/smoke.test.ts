import { describe, expect, it } from 'vitest';
import { describeServer } from '../../src/index.js';

describe('@verifyax/mcp-server', () => {
  it('describes itself and links the SDK version', () => {
    expect(describeServer()).toMatch(/^verifyax-mcp-server \(SDK \d+\.\d+\.\d+\)$/);
  });
});
