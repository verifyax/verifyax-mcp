import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScenarioType, Tag } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'list_compatible_tags';

const DESCRIPTION =
  'Lists the skill tags that can be used to generate a scenario of a given type ' +
  '(info_exchange or interview). Use this before generating a scenario to pick valid tags. ' +
  'Returns each tag’s name, category, and description, and flags QnA tags that must be the only tag.';

const inputSchema = {
  scenario_type: z
    .enum(['info_exchange', 'interview'])
    .describe('The kind of scenario the tags will be used for.'),
};

/**
 * Filter the tag catalogue to those compatible with `scenarioType`, applying
 * the rules from docs/verifyax-api.md (the worker enforces these asynchronously,
 * so we filter client-side to avoid a 201-then-FAILED job):
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
    const family = tag.benchmark_family;
    if (family && family !== 'qna') {
      return scenarioType === 'info_exchange';
    }
    if (family === 'qna') {
      return scenarioType === 'interview';
    }
    return true;
  });
}

export function registerListCompatibleTags(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    { title: 'List compatible skill tags', description: DESCRIPTION, inputSchema },
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
            must_be_sole_tag: tag.benchmark_family === 'qna',
          })),
        };
      })
  );
}
