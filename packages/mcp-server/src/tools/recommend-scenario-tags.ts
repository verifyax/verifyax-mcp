import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NotFoundError, VerifyaxError } from '@verifyax/sdk';
import { z } from 'zod';
import { translateError, type ToolError } from '../error-translation.js';
import type { ToolContext } from './context.js';
import { runTool, toolResult } from './result.js';

const NAME = 'recommend_scenario_tags';

const DESCRIPTION =
  'Suggests skill tags for a scenario type using the same Workbench pipeline as the Scenario ' +
  'Generator (embeddings plus LLM, up to about 20 tags). Use when the user describes a scenario or ' +
  'agent and wants a ranked shortlist before generate_scenario. Prefer this over list_compatible_tags ' +
  'when the catalogue is large or the user gave natural-language context. Read-only (no generation ' +
  'credits). Provide context_prompt and/or agent_uuid (at least one). On recommender timeout or ' +
  'unavailability, try search_scenario_tags or list_compatible_tags.';

const inputObject = z.object({
  scenario_type: z
    .enum(['info_exchange', 'interview'])
    .describe('The kind of scenario the tags will be used for.'),
  context_prompt: z
    .string()
    .optional()
    .describe('Optional scenario context (same meaning as generate_scenario context_prompt).'),
  agent_uuid: z
    .string()
    .optional()
    .describe('Optional workspace agent uuid; A2A agents may trigger a live agent-card fetch.'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

function hasRecommendationContext(args: Input): boolean {
  const prompt = args.context_prompt?.trim();
  const agent = args.agent_uuid?.trim();
  return (prompt !== undefined && prompt.length > 0) || (agent !== undefined && agent.length > 0);
}

function translateRecommendError(error: unknown): ToolError {
  if (error instanceof NotFoundError) {
    const base = translateError(error);
    return {
      ...base,
      suggested_fix: 'Call list_agents to find a valid agent uuid in your workspace.',
    };
  }
  if (error instanceof VerifyaxError) {
    const base = translateError(error);
    const status = error.statusCode;
    if (status === 400) {
      return {
        ...base,
        suggested_fix:
          'Provide context_prompt and/or agent_uuid so the recommender has something to rank against.',
      };
    }
    if (status === 503 || status === 504) {
      return {
        ...base,
        suggested_fix: 'Try search_scenario_tags or list_compatible_tags instead.',
      };
    }
    return base;
  }
  return translateError(error);
}

export function createRecommendScenarioTagsHandler(ctx: ToolContext) {
  return (args: Input) => {
    if (!hasRecommendationContext(args)) {
      return Promise.resolve(
        toolResult(
          {
            success: false,
            reason: 'At least one of context_prompt or agent_uuid is required.',
            suggested_fix:
              'Pass a short scenario description in context_prompt, or agent_uuid for an agent in your workspace.',
          },
          true
        )
      );
    }
    return runTool(
      ctx,
      NAME,
      async () => {
        const tags = await ctx.client.scenarios.recommendTags({
          scenario_type: args.scenario_type,
          ...(args.context_prompt !== undefined ? { context_prompt: args.context_prompt } : {}),
          ...(args.agent_uuid !== undefined ? { agent_uuid: args.agent_uuid } : {}),
        });
        return {
          scenario_type: args.scenario_type,
          count: tags.length,
          tags: tags.map((tag) => ({
            name: tag.name,
            category: tag.category ?? null,
            description: tag.description ?? null,
            benchmark_family: tag.benchmark_family ?? null,
            allowed_scenario_types: tag.allowed_scenario_types ?? null,
            custom: tag.custom ?? false,
          })),
        };
      },
      translateRecommendError
    );
  };
}

export function registerRecommendScenarioTags(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Recommend scenario skill tags',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createRecommendScenarioTagsHandler(ctx)
  );
}
