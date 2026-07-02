import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'list_recent_runs';

const DESCRIPTION =
  'Lists recent simulation runs in your VerifyAX workspace, optionally filtered by status, ' +
  'agent, or scenario. Returns each run’s uuid, status, agent, scenario, and evaluation handle.';

const inputObject = z.object({
  status: z
    .string()
    .optional()
    .describe(
      'Filter by run status. Known values: CREATED, IN_PROGRESS, COMPLETED, FAILED, CANCELLED ' +
        '(open enum — the API may add statuses, which are forwarded rather than rejected).'
    ),
  agent_uuid: z.string().optional(),
  scenario_uuid: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createListRecentRunsHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const runs = await ctx.client.simulations.list(args);
      return {
        count: runs.length,
        runs: runs.map((r) => ({
          uuid: r.uuid,
          status: r.status,
          agent_uuid: r.agent_uuid ?? null,
          scenario_uuid: r.scenario_uuid ?? null,
          evaluation_job_uuid: r.evaluation_job_uuid ?? null,
          created_at: r.created_at ?? null,
        })),
      };
    });
}

export function registerListRecentRuns(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'List recent runs',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createListRecentRunsHandler(ctx)
  );
}
