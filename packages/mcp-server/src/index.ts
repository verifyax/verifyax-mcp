#!/usr/bin/env node
// CLI entry point for the VerifyAX MCP server (bin: verifyax-mcp-server).
// Reads config from the environment, wires the SDK client + logger into the
// server, and serves the MCP protocol over stdio.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createToolContext, reportFatal } from './bootstrap.js';
import { isMainModule } from './main-module.js';
import { createServer } from './server.js';

export async function main(): Promise<void> {
  const ctx = createToolContext();
  const server = createServer(ctx);
  await server.connect(new StdioServerTransport());
  ctx.logger.info('verifyax-mcp-server started', { transport: 'stdio' });
}

if (isMainModule(import.meta.url)) {
  main().catch(reportFatal);
}
