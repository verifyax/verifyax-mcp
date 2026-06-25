import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentParameters, RegisterAgentRequest } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'register_agent';

const DESCRIPTION =
  'Registers an AI agent in VerifyAX given its name, URL, type (A2A or API), and optional auth. ' +
  'For A2A agents it first verifies the agent card is reachable; if that check fails, the agent ' +
  'is not created. Returns the new agent’s uuid and the connectivity result.';

const inputObject = z.object({
  name: z.string().describe('Workspace-unique agent name.'),
  agent_url: z.string().describe('The agent’s endpoint (A2A card URL or REST URL).'),
  agent_type: z.enum(['A2A', 'API']).optional().describe('Defaults to A2A.'),
  description: z.string().optional(),
  auth_method: z.enum(['no-auth', 'bearer', 'cs', 'http-basic']).optional(),
  token: z.string().optional().describe('Token for bearer/cs auth.'),
  basic_username: z.string().optional(),
  basic_password: z.string().optional(),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

function buildAgentParameters(args: Input): AgentParameters | undefined {
  const params: AgentParameters = {};
  if (args.auth_method !== undefined) params.auth_method = args.auth_method;
  if (args.token !== undefined) params.token = args.token;
  if (args.basic_username !== undefined) params.basic_username = args.basic_username;
  if (args.basic_password !== undefined) params.basic_password = args.basic_password;
  return Object.keys(params).length > 0 ? params : undefined;
}

export function createRegisterAgentHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const agentType = args.agent_type ?? 'A2A';
      const agentParameters = buildAgentParameters(args);

      // For A2A, verify the agent card is reachable before creating anything.
      // A failure throws and runTool turns it into a structured tool error.
      let connectivityChecked = false;
      if (agentType === 'A2A') {
        await ctx.client.agents.testAgentCard({
          agent_url: args.agent_url,
          agent_type: agentType,
          ...(agentParameters !== undefined ? { agent_parameters: agentParameters } : {}),
        });
        connectivityChecked = true;
      }

      const request: RegisterAgentRequest = {
        name: args.name,
        agent_url: args.agent_url,
        agent_type: agentType,
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(agentParameters !== undefined ? { agent_parameters: agentParameters } : {}),
      };
      const agent = await ctx.client.agents.create(request);

      return {
        agent: {
          uuid: agent.uuid,
          name: agent.name,
          agent_type: agent.agent_type,
          agent_url: agent.agent_url ?? args.agent_url,
        },
        connectivity_checked: connectivityChecked,
      };
    });
}

export function registerRegisterAgent(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    { title: 'Register agent', description: DESCRIPTION, inputSchema },
    createRegisterAgentHandler(ctx)
  );
}
