import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../tools/context.js';

/** Extra hour beyond the client poll budget before the MCP task record expires. */
export const TASK_TTL_BUFFER_MS = 3_600_000;

export interface GenerateScenarioWork {
  kind: 'generate_scenario';
  ctx: ToolContext;
  scenarioUuid: string;
  jobUuid: string;
  scenarioType: 'info_exchange' | 'interview';
  isBatch: boolean;
  batchUuid?: string;
  batchScenarioUuids?: string[];
}

export type EvaluatePhase = 'run' | 'eval';

export interface EvaluateAgentWork {
  kind: 'evaluate_agent';
  ctx: ToolContext;
  simulationUuid: string;
  creditsEstimate: number | null;
  evalJobUuid?: string;
  phase: EvaluatePhase;
}

export type VerifyaxTaskWork = GenerateScenarioWork | EvaluateAgentWork;

export interface TaskRefreshOutcome {
  status: 'working' | 'completed' | 'failed' | 'cancelled';
  statusMessage?: string;
  result?: CallToolResult;
}
