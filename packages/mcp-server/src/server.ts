import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTaskMessageQueue } from '@modelcontextprotocol/sdk/experimental/tasks/index.js';
import type { ToolContext } from './tools/context.js';
import { registerTools } from './tools/index.js';
import { VerifyaxTaskStore } from './tasks/store.js';
import { VERSION } from './version.js';

export const SERVER_NAME = 'verifyax-mcp-server';
export const SERVER_VERSION = VERSION;

export interface CreateServerResult {
  server: McpServer;
  taskStore: VerifyaxTaskStore;
}

/** Build an MCP server with all VerifyAX tools registered. Does no I/O. */
export function createServer(ctx: ToolContext): CreateServerResult {
  const taskStore = new VerifyaxTaskStore();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tasks: {
          list: {},
          cancel: {},
          requests: {
            tools: {
              call: {},
            },
          },
        },
      },
      taskStore,
      taskMessageQueue: new InMemoryTaskMessageQueue(),
    }
  );
  registerTools(server, ctx, taskStore);
  return { server, taskStore };
}
