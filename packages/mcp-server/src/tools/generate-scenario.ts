import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { GenerateScenarioRequest } from '@verifyax/sdk';
import { z } from 'zod';
import type { VerifyaxTaskStore } from '../tasks/store.js';
import { TASK_TTL_BUFFER_MS } from '../tasks/types.js';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'generate_scenario';

const DESCRIPTION =
  'Generates a new test scenario of a given type (info_exchange or interview) with optional skill ' +
  'tags and context. Typically takes 30s–2min; task-capable MCP clients receive a pollable task ' +
  'handle immediately, while others block until generation finishes. Set num_scenarios greater than ' +
  '1 for batch mode (requires tag_pool). Returns the new scenario’s uuid, or batch uuids when ' +
  'batching, or a structured error with details if generation fails (e.g. incompatible tags).';

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

function buildGenerateRequest(args: Input): GenerateScenarioRequest {
  return {
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
}

/** Kick off scenario generation and return the async job handle. */
export async function startGenerateScenario(ctx: ToolContext, args: Input) {
  const generated = await ctx.client.scenarios.generate(buildGenerateRequest(args));
  const isBatch = (args.num_scenarios ?? 1) > 1;
  return {
    scenarioUuid: generated.uuid,
    jobUuid: generated.job_uuid,
    scenarioType: args.scenario_type,
    isBatch,
    batchUuid: isBatch ? generated.batch_uuid : undefined,
    batchScenarioUuids: isBatch ? generated.batch_scenario_uuids : undefined,
  };
}

export function createGenerateScenarioHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const started = await startGenerateScenario(ctx, args);
      const pollTimeoutMs = generationPollTimeoutMs(args.num_scenarios ?? 1);

      const job = await ctx.client.jobs.pollUntilTerminal(started.jobUuid, {
        timeoutMs: pollTimeoutMs,
        intervalMs: POLL_INTERVAL_MS,
      });

      const isBatch = started.isBatch;
      return {
        scenario_uuid: started.scenarioUuid,
        scenario_type: started.scenarioType,
        job_status: job.current_status,
        ...(isBatch && started.batchUuid !== undefined ? { batch_uuid: started.batchUuid } : {}),
        ...(isBatch && started.batchScenarioUuids !== undefined
          ? { batch_scenario_uuids: started.batchScenarioUuids }
          : {}),
      };
    });
}

export function registerGenerateScenario(
  server: McpServer,
  ctx: ToolContext,
  taskStore: VerifyaxTaskStore
): void {
  server.experimental.tasks.registerToolTask(
    NAME,
    {
      title: 'Generate scenario',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      execution: { taskSupport: 'optional' },
    },
    {
      createTask: async (args, extra) => {
        const started = await startGenerateScenario(ctx, args);
        const pollBudgetMs = generationPollTimeoutMs(args.num_scenarios ?? 1);
        const task = await extra.taskStore.createTask({
          ttl: pollBudgetMs + TASK_TTL_BUFFER_MS,
          pollInterval: POLL_INTERVAL_MS,
        });
        taskStore.setWork(task.taskId, {
          kind: 'generate_scenario',
          ctx,
          scenarioUuid: started.scenarioUuid,
          jobUuid: started.jobUuid,
          scenarioType: started.scenarioType,
          isBatch: started.isBatch,
          ...(started.batchUuid !== undefined ? { batchUuid: started.batchUuid } : {}),
          ...(started.batchScenarioUuids !== undefined
            ? { batchScenarioUuids: started.batchScenarioUuids }
            : {}),
        });
        return { task };
      },
      getTask: async (_args, extra) => {
        const task = await extra.taskStore.getTask(extra.taskId);
        if (!task) {
          throw new Error(`Task ${extra.taskId} not found`);
        }
        return task;
      },
      getTaskResult: async (_args, extra) => {
        const result = await extra.taskStore.getTaskResult(extra.taskId);
        return result as CallToolResult;
      },
    }
  );
}
