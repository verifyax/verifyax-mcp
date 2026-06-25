import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Serialize a tool payload into an MCP tool result. Payloads are JSON so Claude
 * can read structured data; `isError` flags failures (the payload is the
 * structured `{ success: false, ... }` shape from error-translation).
 */
export function toolResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}
