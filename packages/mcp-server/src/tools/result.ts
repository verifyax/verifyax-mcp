import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { translateError } from '../error-translation.js';
import type { ToolContext } from './context.js';

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

/**
 * Run a tool body, wrapping success as `{ success: true, ...data }` and any
 * thrown SDK error as a structured `{ success: false, ... }` tool error. Keeps
 * raw exceptions from ever escaping into MCP output (CLAUDE.md decision 6).
 */
export async function runTool(
  ctx: ToolContext,
  toolName: string,
  body: () => Promise<Record<string, unknown>>
): Promise<CallToolResult> {
  try {
    const data = await body();
    return toolResult({ success: true, ...data });
  } catch (error) {
    ctx.logger.error(`${toolName} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return toolResult(translateError(error), true);
  }
}
