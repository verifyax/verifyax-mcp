import type { VerifyaxClient } from '../client.js';
import type {
  A2aConnectionTestRequest,
  A2aMessageTestRequest,
  Agent,
  AgentCardTestRequest,
  AgentCardTestResult,
  AgentType,
  ApiAgentCurlTestRequest,
  ApiAgentDirectlineTestRequest,
  ApiAgentTestRequest,
  ListParams,
  McpConnectionTestRequest,
  RegisterAgentRequest,
  UpdateAgentRequest,
} from '../types.js';

export interface ListAgentsParams extends ListParams {
  agent_type?: AgentType;
}

/** Agents API — registered AI endpoints, workspace-scoped. */
export class AgentsResource {
  constructor(private readonly client: VerifyaxClient) {}

  async create(body: RegisterAgentRequest): Promise<Agent> {
    return this.client.request<Agent>('POST', '/agents', { body });
  }

  async list(params: ListAgentsParams = {}): Promise<Agent[]> {
    return this.client.request<Agent[]>('GET', '/agents', { query: params });
  }

  async get(agentUuid: string): Promise<Agent> {
    return this.client.request<Agent>('GET', `/agents/${agentUuid}`);
  }

  async update(agentUuid: string, body: UpdateAgentRequest): Promise<Agent> {
    return this.client.request<Agent>('PATCH', `/agents/${agentUuid}`, { body });
  }

  async delete(agentUuid: string): Promise<void> {
    await this.client.request<void>('DELETE', `/agents/${agentUuid}`);
  }

  /** Fetch an A2A agent card to verify connectivity before registering. */
  async testAgentCard(body: AgentCardTestRequest): Promise<AgentCardTestResult> {
    return this.client.request<AgentCardTestResult>('POST', '/agents/tests/agent-card', { body });
  }

  /** A2A card + message probe (optionally runs mini-sims when agent_uuid is set). */
  async testA2aConnection(body: A2aConnectionTestRequest): Promise<unknown> {
    return this.client.request<unknown>('POST', '/agents/tests/a2a-connection', { body });
  }

  /** Single lightweight A2A message probe. */
  async testA2aMessage(body: A2aMessageTestRequest): Promise<unknown> {
    return this.client.request<unknown>('POST', '/agents/tests/a2a-message', { body });
  }

  /** Discover a remote MCP server's tools (and optionally probe the adapter). */
  async testMcpConnection(body: McpConnectionTestRequest): Promise<unknown> {
    return this.client.request<unknown>('POST', '/agents/tests/mcp-connection', { body });
  }

  /** Probe a REST endpoint before registering an API agent. */
  async testApiAgent(body: ApiAgentTestRequest): Promise<unknown> {
    return this.client.request<unknown>('POST', '/agents/tests/api-agent-test', { body });
  }

  /** Parse and execute a cURL command to probe a REST endpoint. */
  async testApiAgentCurl(body: ApiAgentCurlTestRequest): Promise<unknown> {
    return this.client.request<unknown>('POST', '/agents/tests/api-agent-test-curl', { body });
  }

  /** Probe a Copilot Studio (Direct Line) endpoint before registering. */
  async testApiAgentDirectline(body: ApiAgentDirectlineTestRequest): Promise<unknown> {
    return this.client.request<unknown>('POST', '/agents/tests/api-agent-test-directline', {
      body,
    });
  }
}
