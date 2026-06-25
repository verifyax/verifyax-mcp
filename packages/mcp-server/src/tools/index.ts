import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './context.js';
import { registerListCompatibleTags } from './list-compatible-tags.js';

// Explicit registry — each tool exports its own register function and is wired
// here by hand (no barrel auto-discovery). More tools land in Phase 3.
export function registerTools(server: McpServer, ctx: ToolContext): void {
  registerListCompatibleTags(server, ctx);
}
