import { describe, expect, it } from 'vitest';
import { buildInspectorEnvArgs } from '../../scripts/run-inspector.mjs';

describe('buildInspectorEnvArgs', () => {
  it('forwards set VerifyAX env vars as Inspector -e pairs', () => {
    expect(
      buildInspectorEnvArgs({
        VERIFYAX_API_KEY: 'sk-ver-api-test',
        VERIFYAX_BASE_URL: 'https://dev.example.com/api/v1',
        VERIFYAX_WEB_BASE_URL: 'https://dev.example.com/web/api/v1',
        VERIFYAX_MCP_LOG_LEVEL: 'debug',
        PATH: '/usr/bin',
      })
    ).toEqual([
      '-e',
      'VERIFYAX_API_KEY=sk-ver-api-test',
      '-e',
      'VERIFYAX_BASE_URL=https://dev.example.com/api/v1',
      '-e',
      'VERIFYAX_WEB_BASE_URL=https://dev.example.com/web/api/v1',
      '-e',
      'VERIFYAX_MCP_LOG_LEVEL=debug',
    ]);
  });

  it('omits unset or empty VerifyAX env vars', () => {
    expect(buildInspectorEnvArgs({ VERIFYAX_API_KEY: '', VERIFYAX_BASE_URL: undefined })).toEqual(
      []
    );
  });
});
