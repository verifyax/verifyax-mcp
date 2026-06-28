import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './tools/context.js';
import { registerTools } from './tools/index.js';

export const SERVER_NAME = 'verifyax-mcp-server';
export const SERVER_VERSION = '0.2.0';

/** Build an MCP server with all VerifyAX tools registered. Does no I/O. */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, ctx);
  return server;
}
