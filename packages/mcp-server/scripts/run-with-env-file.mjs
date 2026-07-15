// Load a gitignored .env.* file via dotenv-cli, with preflight checks so dev/test
// scripts cannot silently fall back to production VerifyAX defaults.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PRODUCTION_API_BASE_URL = 'https://console.verifyax.com/api/v1';
export const PRODUCTION_WEB_BASE_URL = 'https://console.verifyax.com/web/api/v1';

/**
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseEnvFile(content) {
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * @param {Record<string, string>} env
 * @param {'production' | 'development' | 'testing'} profile
 * @param {string} [envFileName]
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateProfileEnv(env, profile, envFileName = undefined) {
  if (profile !== 'development' && profile !== 'testing') {
    return { ok: true };
  }

  const envFile = envFileName ?? (profile === 'development' ? '.env.dev' : '.env.test');
  const baseUrl = env.VERIFYAX_BASE_URL?.trim();
  const webBaseUrl = env.VERIFYAX_WEB_BASE_URL?.trim();

  if (!baseUrl || !webBaseUrl) {
    return {
      ok: false,
      message:
        `${envFile} must set VERIFYAX_BASE_URL and VERIFYAX_WEB_BASE_URL for ${profile}. ` +
        `Copy packages/mcp-server/.env.example to packages/mcp-server/${envFile} and ` +
        `configure your non-production gateway URLs.`,
    };
  }

  if (baseUrl === PRODUCTION_API_BASE_URL || webBaseUrl === PRODUCTION_WEB_BASE_URL) {
    return {
      ok: false,
      message:
        `${envFile} still points at production (console.verifyax.com). ` +
        `Update VERIFYAX_BASE_URL and VERIFYAX_WEB_BASE_URL with your ${profile} gateway URLs.`,
    };
  }

  return { ok: true };
}

/**
 * @param {string[]} argv
 * @returns {{
 *   envFile: string;
 *   profile: 'production' | 'development' | 'testing';
 *   allowMissingEnvFile: boolean;
 *   command: string[];
 * }}
 */
export function parseArgs(argv) {
  const envFileIndex = argv.indexOf('--dotenv-file');
  const profileIndex = argv.indexOf('--profile');
  const separatorIndex = argv.indexOf('--');

  if (envFileIndex === -1 || profileIndex === -1 || separatorIndex === -1) {
    throw new Error(
      'Usage: node scripts/run-with-env-file.mjs --dotenv-file <path> --profile <production|development|testing> ' +
        '[--allow-missing-env-file] -- <command...>'
    );
  }

  const envFile = argv[envFileIndex + 1];
  const profile = argv[profileIndex + 1];
  if (!envFile || !profile) {
    throw new Error('Missing value for --dotenv-file or --profile.');
  }
  if (profile !== 'production' && profile !== 'development' && profile !== 'testing') {
    throw new Error(`Invalid --profile "${profile}".`);
  }

  const command = argv.slice(separatorIndex + 1);
  if (command.length === 0) {
    throw new Error('Missing command after --.');
  }

  return {
    envFile,
    profile,
    allowMissingEnvFile: argv.includes('--allow-missing-env-file'),
    command,
  };
}

/**
 * @param {{
 *   envFile: string;
 *   profile: 'production' | 'development' | 'testing';
 *   allowMissingEnvFile: boolean;
 *   command: string[];
 * }} options
 * @returns {number}
 */
export function preflight(options) {
  const envPath = resolve(packageRoot, options.envFile);
  if (!existsSync(envPath)) {
    if (options.allowMissingEnvFile) {
      return 0;
    }
    console.error(
      `Missing ${options.envFile}. Copy packages/mcp-server/.env.example to ` +
        `packages/mcp-server/${options.envFile} and configure your ${options.profile} gateway URLs.`
    );
    return 1;
  }

  const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
  const validation = validateProfileEnv(parsed, options.profile, options.envFile);
  if (!validation.ok) {
    console.error(validation.message);
    return 1;
  }

  return 0;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const code = preflight(options);
  if (code !== 0) {
    process.exit(code);
  }

  const envPath = resolve(packageRoot, options.envFile);
  const dotenvArgs = ['dotenv'];
  if (existsSync(envPath)) {
    dotenvArgs.push('-e', options.envFile);
  }
  dotenvArgs.push('-v', `VERIFYAX_MCP_TARGET_ENV=${options.profile}`, '--', ...options.command);

  const child = spawn('npx', dotenvArgs, {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('error', (error) => {
    console.error(error.message);
    process.exit(1);
  });

  child.on('exit', (exitCode, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(exitCode ?? 1);
  });
}

function isMainModule() {
  const invoked = process.argv[1];
  if (!invoked) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(realpathSync(invoked)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
