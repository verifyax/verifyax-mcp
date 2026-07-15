import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_API_BASE_URL,
  PRODUCTION_WEB_BASE_URL,
  buildDotenvArgs,
  parseArgs,
  parseEnvFile,
  preflight,
  validateProfileEnv,
} from '../../scripts/run-with-env-file.mjs';

describe('parseEnvFile', () => {
  it('parses key/value pairs and ignores comments', () => {
    expect(
      parseEnvFile(`
# comment
VERIFYAX_BASE_URL=https://dev.example.com/api/v1
VERIFYAX_WEB_BASE_URL="https://dev.example.com/web/api/v1"
`)
    ).toEqual({
      VERIFYAX_BASE_URL: 'https://dev.example.com/api/v1',
      VERIFYAX_WEB_BASE_URL: 'https://dev.example.com/web/api/v1',
    });
  });
});

describe('validateProfileEnv', () => {
  it('requires non-production URLs for development', () => {
    expect(validateProfileEnv({}, 'development').ok).toBe(false);
    expect(
      validateProfileEnv(
        {
          VERIFYAX_BASE_URL: PRODUCTION_API_BASE_URL,
          VERIFYAX_WEB_BASE_URL: PRODUCTION_WEB_BASE_URL,
        },
        'development'
      ).ok
    ).toBe(false);
  });

  it('accepts non-production URLs for testing', () => {
    expect(
      validateProfileEnv(
        {
          VERIFYAX_BASE_URL: 'https://test.example.com/api/v1',
          VERIFYAX_WEB_BASE_URL: 'https://test.example.com/web/api/v1',
        },
        'testing'
      )
    ).toEqual({ ok: true });
  });
});

describe('parseArgs', () => {
  it('parses env file, profile, and command', () => {
    expect(
      parseArgs([
        '--dotenv-file',
        '.env.dev',
        '--profile',
        'development',
        '--',
        'node',
        'dist/http.js',
      ])
    ).toEqual({
      envFile: '.env.dev',
      profile: 'development',
      allowMissingEnvFile: false,
      command: ['node', 'dist/http.js'],
    });
  });
});

describe('buildDotenvArgs', () => {
  const baseOptions = {
    envFile: '.env.dev',
    profile: 'development' as const,
    command: ['node', 'dist/http.js'],
  };

  it('passes -o so .env file values override shell VERIFYAX_* vars', () => {
    expect(buildDotenvArgs(baseOptions, true)).toEqual([
      'dotenv',
      '-o',
      '-e',
      '.env.dev',
      '-v',
      'VERIFYAX_MCP_TARGET_ENV=development',
      '--',
      'node',
      'dist/http.js',
    ]);
  });

  it('omits -e and -o when the env file is missing', () => {
    expect(buildDotenvArgs(baseOptions, false)).toEqual([
      'dotenv',
      '-v',
      'VERIFYAX_MCP_TARGET_ENV=development',
      '--',
      'node',
      'dist/http.js',
    ]);
  });
});

describe('preflight', () => {
  it('fails when a required non-prod env file is missing', () => {
    expect(
      preflight({
        envFile: '.env.definitely-missing-for-tests',
        profile: 'development',
        allowMissingEnvFile: false,
        command: ['node', 'dist/http.js'],
      })
    ).toBe(1);
  });

  it('allows a missing production env file when configured', () => {
    expect(
      preflight({
        envFile: '.env.definitely-missing-for-tests',
        profile: 'production',
        allowMissingEnvFile: true,
        command: ['node', 'dist/http.js'],
      })
    ).toBe(0);
  });
});
