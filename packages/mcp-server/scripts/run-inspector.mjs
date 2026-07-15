// Launch MCP Inspector for the stdio entry point, forwarding VerifyAX env vars via
// Inspector's -e flag. Inspector only passes a small default whitelist (PATH, HOME,
// …) to the spawned stdio server unless variables are set explicitly with -e.

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../dist/main-module.js';

/** Env vars the stdio server reads; forwarded to Inspector as -e KEY=value pairs. */
export const VERIFYAX_INSPECTOR_ENV_KEYS = [
  'VERIFYAX_API_KEY',
  'VERIFYAX_BASE_URL',
  'VERIFYAX_WEB_BASE_URL',
  'VERIFYAX_MCP_LOG_LEVEL',
];

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function buildInspectorEnvArgs(env) {
  const args = [];
  for (const key of VERIFYAX_INSPECTOR_ENV_KEYS) {
    const value = env[key];
    if (value === undefined || value === '') {
      continue;
    }
    args.push('-e', `${key}=${value}`);
  }
  return args;
}

function main() {
  const inspectorArgs = [
    '@modelcontextprotocol/inspector',
    ...buildInspectorEnvArgs(process.env),
    '--',
    'node',
    'dist/index.js',
  ];

  const child = spawn('npx', inspectorArgs, {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('error', (error) => {
    console.error(error.message);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

if (isMainModule(import.meta.url)) {
  main();
}
