import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GenerateScenarioRequest } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'generate_scenario';

const DESCRIPTION =
  'Generates a new test scenario of a given type (info_exchange or interview) with optional skill ' +
  'tags and context, then blocks until generation finishes (typically 30s–2min). Set num_scenarios ' +
  'greater than 1 for batch mode (requires tag_pool). Returns the new scenario’s uuid, or batch ' +
  'uuids when batching, or a structured error with details if generation fails (e.g. incompatible tags).';

// Generation can take a couple of minutes; allow generous headroom.
const BASE_GENERATION_POLL_MS = 300_000;
const PER_SCENARIO_POLL_MS = 60_000;
const MAX_GENERATION_POLL_MS = 3_600_000;
const POLL_INTERVAL_MS = 3_000;

/** Scale generation polling with batch size — larger batches need more wall-clock time. */
export function generationPollTimeoutMs(numScenarios: number): number {
  const count = Math.max(1, numScenarios);
  return Math.min(
    BASE_GENERATION_POLL_MS + (count - 1) * PER_SCENARIO_POLL_MS,
    MAX_GENERATION_POLL_MS
  );
}

const inputObject = z.object({
  name: z.string().describe('Workspace-unique scenario name.'),
  scenario_type: z.enum(['info_exchange', 'interview']),
  tags: z
    .array(z.string())
    .optional()
    .describe('Skill tag names (use list_compatible_tags to pick valid ones).'),
  context_prompt: z.string().optional(),
  num_scenarios: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Batch size. 1 = single scenario (default). Greater than 1 requires tag_pool.'),
  tag_pool: z
    .array(z.string())
    .optional()
    .describe('Required when num_scenarios > 1; universe of tag names to sample from.'),
  include_tags: z
    .array(z.string())
    .optional()
    .describe('Batch only; tags required in every scenario (subset of tag_pool).'),
  total_tags: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Batch only; tags drawn per scenario from tag_pool.'),
  max_tags_per_npc: z.number().int().min(1).optional().describe('Batch only; caps tags per NPC.'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createGenerateScenarioHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const request: GenerateScenarioRequest = {
        name: args.name,
        scenario_type: args.scenario_type,
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.context_prompt !== undefined ? { context_prompt: args.context_prompt } : {}),
        ...(args.num_scenarios !== undefined ? { num_scenarios: args.num_scenarios } : {}),
        ...(args.tag_pool !== undefined ? { tag_pool: args.tag_pool } : {}),
        ...(args.include_tags !== undefined ? { include_tags: args.include_tags } : {}),
        ...(args.total_tags !== undefined ? { total_tags: args.total_tags } : {}),
        ...(args.max_tags_per_npc !== undefined ? { max_tags_per_npc: args.max_tags_per_npc } : {}),
      };
      const generated = await ctx.client.scenarios.generate(request);

      const pollTimeoutMs = generationPollTimeoutMs(args.num_scenarios ?? 1);

      // Block until the async generation job reaches a terminal state. A FAILED
      // job throws JobFailedError (carrying error_details), surfaced by runTool.
      const job = await ctx.client.jobs.pollUntilTerminal(generated.job_uuid, {
        timeoutMs: pollTimeoutMs,
        intervalMs: POLL_INTERVAL_MS,
      });

      const isBatch = (args.num_scenarios ?? 1) > 1;
      return {
        scenario_uuid: generated.uuid,
        scenario_type: args.scenario_type,
        job_status: job.current_status,
        ...(isBatch && generated.batch_uuid !== undefined
          ? { batch_uuid: generated.batch_uuid }
          : {}),
        ...(isBatch && generated.batch_scenario_uuids !== undefined
          ? { batch_scenario_uuids: generated.batch_scenario_uuids }
          : {}),
      };
    });
}

export function registerGenerateScenario(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Generate scenario',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    createGenerateScenarioHandler(ctx)
  );
}
