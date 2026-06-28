import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'list_scenarios';

const DESCRIPTION =
  'Lists the test scenarios in your VerifyAX workspace, optionally filtered by type ' +
  '(info_exchange or interview) and status. Returns each scenario’s uuid, name, type, and status.';

const inputObject = z.object({
  scenario_type: z.enum(['info_exchange', 'interview']).optional(),
  status: z.enum(['INIT', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED']).optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createListScenariosHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const scenarios = await ctx.client.scenarios.list(args);
      return {
        count: scenarios.length,
        scenarios: scenarios.map((s) => ({
          uuid: s.uuid,
          name: s.name,
          scenario_type: s.scenario_type ?? null,
          status: s.status ?? null,
        })),
      };
    });
}

export function registerListScenarios(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'List scenarios',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createListScenariosHandler(ctx)
  );
}
