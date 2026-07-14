import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  AgentParameters,
  DirectLineParameters,
  DirectLineRegion,
  McpParameters,
  RegisterAgentRequest,
} from '@verifyax/sdk';
import { VerifyaxError } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'register_agent';

const DESCRIPTION =
  'Registers an AI agent in VerifyAX given its name, connector type (A2A, API, DIRECTLINE for ' +
  'Copilot Studio, or MCP), URL, and optional auth or connector settings. For A2A agents it ' +
  'first verifies the agent card is reachable; DIRECTLINE and MCP agents are probed before ' +
  'creation. Returns the new agent’s uuid and whether connectivity was checked. Note: any token, ' +
  'Direct Line secret, or password passed here transits the conversation — prefer supplying ' +
  'credentials out of band where possible.';

const directLineRegionSchema = z.enum([
  'global',
  'europe',
  'india',
  'unitedstates',
  'asia',
  'australia',
  'northamerica',
]);

const directlineInputSchema = z.object({
  secret: z.string().min(1).describe('Direct Line secret from Copilot Studio. Sensitive.'),
  region: directLineRegionSchema.optional().describe('Defaults to global.'),
  base_url: z
    .string()
    .url()
    .optional()
    .describe('Optional override for the regional Direct Line host.'),
});

const mcpInputSchema = z.object({
  url: z.string().url().describe('Remote MCP server URL (HTTPS).'),
  auth_method: z.enum(['bearer', 'none']).optional(),
  token: z.string().optional().describe('Bearer token or PAT. Sensitive.'),
  transport: z.enum(['streamable-http', 'sse', 'auto']).optional(),
  enabled_tools: z.array(z.string()).optional(),
});

const inputObject = z.object({
  name: z.string().describe('Workspace-unique agent name.'),
  agent_url: z
    .string()
    .url()
    .optional()
    .describe(
      'Endpoint URL. Required for A2A, API, and MCP (catalogue adapter A2A URL). ' +
        'Optional for DIRECTLINE — derived from region when omitted.'
    ),
  agent_type: z.enum(['A2A', 'API', 'DIRECTLINE', 'MCP']).optional().describe('Defaults to A2A.'),
  description: z.string().optional(),
  auth_method: z.enum(['no-auth', 'bearer', 'cs', 'http-basic']).optional(),
  token: z
    .string()
    .optional()
    .describe('Token for bearer/cs auth. Sensitive — see the note in the tool description.'),
  basic_username: z.string().optional(),
  basic_password: z
    .string()
    .optional()
    .describe('Sensitive — see the note in the tool description.'),
  directline: directlineInputSchema.optional(),
  mcp: mcpInputSchema.optional(),
  include_full_context: z.enum(['always', 'never', 'first_only']).optional(),
  include_message_history: z.boolean().optional(),
  max_requests_per_minute: z.number().int().positive().optional(),
  timeout: z.number().int().min(500).optional().describe('Request timeout in milliseconds.'),
  default_output_modes: z.array(z.string()).optional(),
  agent_card_url: z.string().url().optional(),
  agent_card_path: z.string().optional(),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

/** Map a Direct Line region to the regional host URL. */
export function directLineUrlFromRegion(
  region: DirectLineRegion = 'global',
  baseUrl?: string
): string {
  if (baseUrl !== undefined && baseUrl.length > 0) {
    return baseUrl;
  }
  if (region === 'global') {
    return 'https://directline.botframework.com';
  }
  return `https://${region}.directline.botframework.com`;
}

/**
 * The flat Direct Line probe only accepts secret + region (the API maps region to a host).
 * Skip probing when the registered URL would differ from that mapping.
 */
export function canProbeDirectLine(args: Input, agentUrl: string): boolean {
  const dl = args.directline;
  if (dl === undefined) {
    return false;
  }
  if (dl.base_url !== undefined) {
    return false;
  }
  const region = (dl.region ?? 'global') as DirectLineRegion;
  const regionalUrl = directLineUrlFromRegion(region);
  return agentUrl === regionalUrl;
}

/** Infer connector type from explicit input or nested connector blocks. */
export function resolveAgentType(args: Input): NonNullable<Input['agent_type']> {
  if (args.agent_type !== undefined) {
    return args.agent_type;
  }
  if (args.directline !== undefined) {
    return 'DIRECTLINE';
  }
  if (args.mcp !== undefined) {
    return 'MCP';
  }
  return 'A2A';
}

function buildFlatAgentParameters(args: Input): AgentParameters {
  const params: AgentParameters = {};
  if (args.auth_method !== undefined) params.auth_method = args.auth_method;
  if (args.token !== undefined) params.token = args.token;
  if (args.basic_username !== undefined) params.basic_username = args.basic_username;
  if (args.basic_password !== undefined) params.basic_password = args.basic_password;
  if (args.include_full_context !== undefined)
    params.include_full_context = args.include_full_context;
  if (args.include_message_history !== undefined) {
    params.include_message_history = args.include_message_history;
  }
  if (args.max_requests_per_minute !== undefined) {
    params.max_requests_per_minute = args.max_requests_per_minute;
  }
  if (args.timeout !== undefined) params.timeout = args.timeout;
  if (args.default_output_modes !== undefined)
    params.default_output_modes = args.default_output_modes;
  if (args.agent_card_url !== undefined) params.agent_card_url = args.agent_card_url;
  if (args.agent_card_path !== undefined) params.agent_card_path = args.agent_card_path;
  return params;
}

function buildDirectLineParameters(args: Input): DirectLineParameters {
  const dl = args.directline;
  if (dl === undefined) {
    throw new VerifyaxError('DIRECTLINE agents require directline.secret.');
  }
  const region = (dl.region ?? 'global') as DirectLineRegion;
  return {
    secret: dl.secret,
    region,
    ...(dl.base_url !== undefined ? { base_url: dl.base_url } : {}),
  };
}

function buildMcpParameters(args: Input): McpParameters {
  const mcp = args.mcp;
  if (mcp === undefined) {
    throw new VerifyaxError('MCP agents require mcp.url (remote MCP server URL).');
  }
  return {
    url: mcp.url,
    ...(mcp.auth_method !== undefined ? { auth_method: mcp.auth_method } : {}),
    ...(mcp.token !== undefined ? { token: mcp.token } : {}),
    ...(mcp.transport !== undefined ? { transport: mcp.transport } : {}),
    ...(mcp.enabled_tools !== undefined ? { enabled_tools: mcp.enabled_tools } : {}),
  };
}

function buildAgentParameters(
  args: Input,
  agentType: Input['agent_type']
): AgentParameters | undefined {
  const params = buildFlatAgentParameters(args);

  if (agentType === 'DIRECTLINE') {
    params.directline = buildDirectLineParameters(args);
  }
  if (agentType === 'MCP') {
    params.mcp = buildMcpParameters(args);
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

function resolveAgentUrl(args: Input, agentType: NonNullable<Input['agent_type']>): string {
  if (agentType === 'DIRECTLINE') {
    const dl = args.directline;
    if (dl === undefined) {
      throw new VerifyaxError('DIRECTLINE agents require directline.secret.');
    }
    const region = (dl.region ?? 'global') as DirectLineRegion;
    return args.agent_url ?? directLineUrlFromRegion(region, dl.base_url);
  }

  if (args.agent_url === undefined || args.agent_url.length === 0) {
    throw new VerifyaxError(`agent_url is required for ${agentType} agents.`);
  }
  return args.agent_url;
}

export function createRegisterAgentHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const agentType = resolveAgentType(args);
      const agentUrl = resolveAgentUrl(args, agentType);
      const agentParameters = buildAgentParameters(args, agentType);

      let connectivityChecked = false;
      if (agentType === 'A2A') {
        await ctx.client.agents.testAgentCard({
          agent_url: agentUrl,
          agent_type: agentType,
          ...(agentParameters !== undefined ? { agent_parameters: agentParameters } : {}),
        });
        connectivityChecked = true;
      } else if (agentType === 'DIRECTLINE') {
        const dl = args.directline;
        if (dl === undefined) {
          throw new VerifyaxError('DIRECTLINE agents require directline.secret.');
        }
        if (canProbeDirectLine(args, agentUrl)) {
          await ctx.client.agents.testApiAgentDirectline({
            secret: dl.secret,
            region: dl.region ?? 'global',
            message: 'Hello',
          });
          connectivityChecked = true;
        }
      } else if (agentType === 'MCP') {
        const mcp = args.mcp;
        if (mcp === undefined) {
          throw new VerifyaxError('MCP agents require mcp.url (remote MCP server URL).');
        }
        await ctx.client.agents.testMcpConnection({
          mcp_url: mcp.url,
          ...(mcp.auth_method !== undefined ? { auth_method: mcp.auth_method } : {}),
          ...(mcp.token !== undefined ? { token: mcp.token } : {}),
          ...(mcp.transport !== undefined ? { transport: mcp.transport } : {}),
          agent_url: agentUrl,
        });
        connectivityChecked = true;
      }

      const request: RegisterAgentRequest = {
        name: args.name,
        agent_url: agentUrl,
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
          agent_url: agent.agent_url ?? agentUrl,
        },
        connectivity_checked: connectivityChecked,
      };
    });
}

export function registerRegisterAgent(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Register agent',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    createRegisterAgentHandler(ctx)
  );
}
