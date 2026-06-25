#!/usr/bin/env node
// CLI entry point for the VerifyAX MCP server (bin: verifyax-mcp-server).
// The MCP wiring (auth, logging, server, tools) lands in Phase 2 (see PLAN.md).
// For now this verifies the workspace link to @verifyax/sdk and the bin contract.

import { SDK_VERSION } from '@verifyax/sdk';

export function describeServer(): string {
  return `verifyax-mcp-server (SDK ${SDK_VERSION})`;
}

// Executed only when run as the bin, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stderr.write(`${describeServer()}\n`);
}
