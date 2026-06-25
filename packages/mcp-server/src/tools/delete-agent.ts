import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'delete_agent';

const DESCRIPTION =
  'Permanently deletes an agent from your VerifyAX workspace by its uuid. This cannot be undone. ' +
  'Returns confirmation of the deletion.';

const inputObject = z.object({
  agent_uuid: z.string().describe('The uuid of the agent to permanently delete.'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createDeleteAgentHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      await ctx.client.agents.delete(args.agent_uuid);
      return { deleted: true, agent_uuid: args.agent_uuid };
    });
}

export function registerDeleteAgent(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Delete agent',
      description: DESCRIPTION,
      inputSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    createDeleteAgentHandler(ctx)
  );
}
