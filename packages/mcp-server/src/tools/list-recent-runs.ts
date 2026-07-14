import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'list_recent_runs';

const DESCRIPTION =
  'Lists recent simulation runs in your VerifyAX workspace, optionally filtered by status, ' +
  'agent, scenario, date range, search text, or run group. Returns each run’s uuid, status, ' +
  'agent, scenario, and evaluation handle.';

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
  run_group_uuid: z.string().optional().describe('Filter to runs in a linked run group.'),
  date_from: z.string().optional().describe('ISO 8601 start of the created-at window.'),
  date_to: z.string().optional().describe('ISO 8601 end of the created-at window.'),
  search: z.string().optional().describe('Free-text search across run metadata.'),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createListRecentRunsHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const result = await ctx.client.simulations.list(args);
      const runs = Array.isArray(result) ? result : [];

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
