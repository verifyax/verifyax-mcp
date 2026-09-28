import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RateLimitError } from '@verifyax/sdk';
import { z } from 'zod';
import { translateError, type ToolError } from '../error-translation.js';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'search_scenario_tags';

const DESCRIPTION =
  'Finds skill tags for a scenario type by embedding similarity to a natural-language query ' +
  '(no LLM). Cheaper than recommend_scenario_tags — good for “find tags about X”. Read-only. A ' +
  'per-user tag-search rate limit applies in addition to the workspace public API limit; on rate ' +
  'limit, honor Retry-After, wait and retry, or use list_compatible_tags for the full filtered catalogue.';

const inputObject = z.object({
  scenario_type: z
    .enum(['info_exchange', 'interview'])
    .describe('The kind of scenario the tags will be used for.'),
  query: z
    .string()
    .min(2)
    .describe('Natural-language search text (at least 2 characters).'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Max tag names to return (default 50).'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

function translateSearchError(error: unknown): ToolError {
  if (error instanceof RateLimitError) {
    const base = translateError(error);
    return {
      ...base,
      suggested_fix:
        'Honor Retry-After if present, wait and retry, or use list_compatible_tags for the full filtered catalogue.',
    };
  }
  return translateError(error);
}

export function createSearchScenarioTagsHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(
      ctx,
      NAME,
      async () => {
        const skillTags = await ctx.client.scenarios.searchTags({
          scenario_type: args.scenario_type,
          query: args.query,
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        });
        return {
          scenario_type: args.scenario_type,
          count: skillTags.length,
          skill_tags: skillTags,
        };
      },
      translateSearchError
    );
}

export function registerSearchScenarioTags(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Search scenario skill tags',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createSearchScenarioTagsHandler(ctx)
  );
}
