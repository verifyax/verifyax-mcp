#!/usr/bin/env node
// CLI entry point for the VerifyAX MCP server (bin: verifyax-mcp-server).
// Reads config from the environment, wires the SDK client + logger into the
// server, and serves the MCP protocol over stdio.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VerifyaxClient, type VerifyaxClientOptions } from '@verifyax/sdk';
import { readApiKey } from './auth.js';
import { createLogger } from './logging.js';
import { createServer } from './server.js';

export async function main(): Promise<void> {
  const logger = createLogger();
  const apiKey = readApiKey();

  const options: VerifyaxClientOptions = { apiKey };
  // Optional base-URL overrides (used by the conformance test and self-hosting).
  const baseUrl = process.env.VERIFYAX_BASE_URL;
  if (baseUrl) {
    options.baseUrl = baseUrl;
  }
  const webBaseUrl = process.env.VERIFYAX_WEB_BASE_URL;
  if (webBaseUrl) {
    options.webBaseUrl = webBaseUrl;
  }

  const client = new VerifyaxClient(options);
  const server = createServer({ client, logger });

  await server.connect(new StdioServerTransport());
  logger.info('verifyax-mcp-server started');
}

// Run only when executed as the bin, not when imported by tests. Resolve the
// real path of argv[1] first: Node sets import.meta.url to the realpath, so a
// launch via a symlink/junction (e.g. pnpm global, npx cache) would otherwise
// fail this check and the server would never start.
function isMainModule(): boolean {
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
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'fatal', error: message })}\n`);
    process.exit(1);
  });
}
