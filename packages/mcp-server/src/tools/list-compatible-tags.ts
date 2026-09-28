import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScenarioType, Tag } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'list_compatible_tags';

const DESCRIPTION =
  'Lists the full skill-tag catalogue filtered to tags compatible with a given scenario type ' +
  '(info_exchange or interview). Use recommend_scenario_tags or search_scenario_tags for a ranked ' +
  'shortlist when the user gave natural language or the list is too large. Returns each tag’s name, ' +
  'category, and description, and flags QnA tags that must be the only tag.';

// Declared via z.object(...).shape to match the other tools (was a bare literal).
const inputObject = z.object({
  scenario_type: z
    .enum(['info_exchange', 'interview'])
    .describe('The kind of scenario the tags will be used for.'),
});
const inputSchema = inputObject.shape;

/**
 * Filter the tag catalogue to those compatible with `scenarioType`, applying
 * the rules from docs/verifyax-api.md (same rules enforced synchronously on generate):
 *  - allowed_scenario_types must include the type ([] = not selectable; omitted = both)
 *  - benchmark tags (benchmark_family set, except "qna") are info_exchange only
 *  - QnA tags (benchmark_family "qna") are interview only
 */
export function filterCompatibleTags(tags: Tag[], scenarioType: ScenarioType): Tag[] {
  return tags.filter((tag) => {
    const allowed = tag.allowed_scenario_types;
    if (Array.isArray(allowed) && allowed.length === 0) {
      return false;
    }
    const typeAllowed = allowed === undefined ? true : allowed.includes(scenarioType);
    if (!typeAllowed) {
      return false;
    }
    const families = benchmarkFamilies(tag);
    if (families.includes('qna')) {
      return scenarioType === 'interview';
    }
    if (families.length > 0) {
      return scenarioType === 'info_exchange';
    }
    return true;
  });
}

/** Normalize benchmark_family (string | string[] | null) to a string array. */
function benchmarkFamilies(tag: Tag): string[] {
  const family = tag.benchmark_family;
  if (Array.isArray(family)) {
    return family;
  }
  return typeof family === 'string' && family.length > 0 ? [family] : [];
}

export function registerListCompatibleTags(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'List compatible skill tags',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    ({ scenario_type }) =>
      runTool(ctx, NAME, async () => {
        const tags = await ctx.client.tags.list();
        const compatible = filterCompatibleTags(tags, scenario_type);
        return {
          scenario_type,
          count: compatible.length,
          tags: compatible.map((tag) => ({
            name: tag.name,
            category: tag.category ?? null,
            description: tag.description ?? null,
            benchmark_family: tag.benchmark_family ?? null,
            must_be_sole_tag: benchmarkFamilies(tag).includes('qna'),
          })),
        };
      })
  );
}
