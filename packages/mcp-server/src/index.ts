#!/usr/bin/env node
// CLI entry point for the VerifyAX MCP server (bin: verifyax-mcp-server).
// Reads config from the environment, wires the SDK client + logger into the
// server, and serves the MCP protocol over stdio.

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

// Run only when executed as the bin, not when imported by tests.
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'fatal', error: message })}\n`);
    process.exit(1);
  });
}
