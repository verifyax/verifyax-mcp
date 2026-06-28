import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'list_agents';

const DESCRIPTION =
  'Lists the AI agents registered in your VerifyAX workspace, optionally filtered by type ' +
  '(A2A or API). Returns each agent’s uuid, name, type, and URL.';

const inputObject = z.object({
  agent_type: z.enum(['A2A', 'API']).optional().describe('Filter to a single agent type.'),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createListAgentsHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const agents = await ctx.client.agents.list(args);
      return {
        count: agents.length,
        agents: agents.map((a) => ({
          uuid: a.uuid,
          name: a.name,
          agent_type: a.agent_type,
          agent_url: a.agent_url ?? null,
          description: a.description ?? null,
        })),
      };
    });
}

export function registerListAgents(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'List agents',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createListAgentsHandler(ctx)
  );
}
