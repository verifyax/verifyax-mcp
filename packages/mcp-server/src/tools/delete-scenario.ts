import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'delete_scenario';

const DESCRIPTION =
  'Permanently deletes a scenario from your VerifyAX workspace by its uuid. This cannot be undone ' +
  'and fails if simulation runs still reference the scenario. Returns confirmation of the deletion.';

const inputObject = z.object({
  scenario_uuid: z.string().describe('The uuid of the scenario to permanently delete.'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createDeleteScenarioHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      await ctx.client.scenarios.delete(args.scenario_uuid);
      return { deleted: true, scenario_uuid: args.scenario_uuid };
    });
}

export function registerDeleteScenario(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Delete scenario',
      description: DESCRIPTION,
      inputSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    createDeleteScenarioHandler(ctx)
  );
}
