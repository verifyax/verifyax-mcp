import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './context.js';
import { registerDeleteAgent } from './delete-agent.js';
import { registerDeleteScenario } from './delete-scenario.js';
import { registerEvaluateAgent } from './evaluate-agent.js';
import { registerGenerateScenario } from './generate-scenario.js';
import { registerGetRunDetails } from './get-run-details.js';
import { registerGetUsageSummary } from './get-usage-summary.js';
import { registerListAgents } from './list-agents.js';
import { registerListCompatibleTags } from './list-compatible-tags.js';
import { registerListRecentRuns } from './list-recent-runs.js';
import { registerListScenarios } from './list-scenarios.js';
import { registerPreviewRunCost } from './preview-run-cost.js';
import { registerRegisterAgent } from './register-agent.js';

// Explicit registry — each tool exports its own register function and is wired
// here by hand (no barrel auto-discovery). This is the full v1 catalogue of 12 tools.
export function registerTools(server: McpServer, ctx: ToolContext): void {
  registerListCompatibleTags(server, ctx);
  registerRegisterAgent(server, ctx);
  registerListAgents(server, ctx);
  registerDeleteAgent(server, ctx);
  registerGenerateScenario(server, ctx);
  registerListScenarios(server, ctx);
  registerDeleteScenario(server, ctx);
  registerEvaluateAgent(server, ctx);
  registerListRecentRuns(server, ctx);
  registerGetRunDetails(server, ctx);
  registerGetUsageSummary(server, ctx);
  registerPreviewRunCost(server, ctx);
}
