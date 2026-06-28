import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'preview_run_cost';

const DESCRIPTION =
  'Estimates the credit cost of running an agent against a scenario before triggering it. ' +
  'Returns the estimated credits, your current balance, and any pending committed spend.';

const inputObject = z.object({
  scenario_uuid: z.string().describe('The scenario the run would use.'),
  agent_uuid: z.string().optional().describe('The agent that would run (optional).'),
  num_runs: z.number().int().positive().optional().describe('Parallel repetitions (default 1).'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createPreviewRunCostHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const preview = await ctx.client.simulations.creditPreview({
        mode: 'scenario_run',
        scenario_uuid: args.scenario_uuid,
        ...(args.agent_uuid !== undefined ? { agent_uuid: args.agent_uuid } : {}),
        ...(args.num_runs !== undefined ? { num_runs: args.num_runs } : {}),
      });
      return {
        estimated_credits: preview.newRunEstimatedCredits ?? null,
        balance: preview.balance ?? null,
        existing_runs: preview.existingRuns ?? null,
        pending_committed_total: preview.pendingCommittedTotal ?? null,
      };
    });
}

export function registerPreviewRunCost(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Preview run cost',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createPreviewRunCostHandler(ctx)
  );
}
