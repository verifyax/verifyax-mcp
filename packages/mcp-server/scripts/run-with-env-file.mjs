// Load a gitignored .env.* file via dotenv-cli, with preflight checks so dev/test
// scripts cannot silently fall back to production VerifyAX defaults.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import {
  PRODUCTION_API_BASE_URL,
  PRODUCTION_WEB_BASE_URL,
  checkNonProductionBaseUrls,
  nonProductionEnvFileName,
  requiresNonProductionBaseUrls,
} from '../dist/target-env-guard.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export { PRODUCTION_API_BASE_URL, PRODUCTION_WEB_BASE_URL };

/**
 * Resolve .env file values the same way dotenv-cli does: parse with dotenv,
 * apply file entries over {@link parentEnv} (-o / --override), then expand
 * $VAR / ${VAR} references.
 *
 * @param {string} content
 * @param {NodeJS.ProcessEnv} [parentEnv]
 * @returns {NodeJS.ProcessEnv}
 */
export function parseEnvFile(content, parentEnv = process.env) {
  const parsed = dotenv.parse(content);
  const merged = { ...parentEnv, ...parsed };
  expand({ parsed: merged, processEnv: merged });
  return merged;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {'production' | 'development' | 'testing'} profile
 * @param {string} [envFileName]
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateProfileEnv(env, profile, envFileName = undefined) {
  if (!requiresNonProductionBaseUrls(profile)) {
    return { ok: true };
  }

  const envFile = envFileName ?? nonProductionEnvFileName(profile);
  const check = checkNonProductionBaseUrls(env);

  if (check.ok) {
    return { ok: true };
  }

  if (check.reason === 'missing') {
    return {
      ok: false,
      message:
        `${envFile} must set VERIFYAX_BASE_URL and VERIFYAX_WEB_BASE_URL for ${profile}. ` +
        `Copy packages/mcp-server/.env.example to packages/mcp-server/${envFile} and ` +
        `configure your non-production gateway URLs.`,
    };
  }

  return {
    ok: false,
    message:
      `${envFile} still points at production (console.verifyax.com). ` +
      `Update VERIFYAX_BASE_URL and VERIFYAX_WEB_BASE_URL with your ${profile} gateway URLs.`,
  };
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

/**
 * @param {{
 *   envFile: string;
 *   profile: 'production' | 'development' | 'testing';
 *   command: string[];
 * }} options
 * @param {boolean} envFileExists
 * @returns {string[]}
 */
export function buildDotenvArgs(options, envFileExists) {
  const dotenvArgs = ['dotenv'];
  if (envFileExists) {
    // File values must win over shell VERIFYAX_* overrides so preflight matches runtime.
    dotenvArgs.push('-o', '-e', options.envFile);
  }
  dotenvArgs.push('-v', `VERIFYAX_MCP_TARGET_ENV=${options.profile}`, '--', ...options.command);
  return dotenvArgs;
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
  const dotenvArgs = buildDotenvArgs(options, existsSync(envPath));

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
