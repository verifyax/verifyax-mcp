import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Evaluation } from '@verifyax/sdk';
import { NotFoundError, VerifyaxError } from '@verifyax/sdk';
import { z } from 'zod';
import { translateError, type ToolError } from '../error-translation.js';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'get_evaluation_report';

const DESCRIPTION =
  'Fetches the evaluation report for a completed simulation run by its simulation uuid. Read-only. ' +
  'Returns overall score, per-tag scores, status, and recommendations as the platform provides them. ' +
  'Does not include the dialogue transcript — use get_run_output for that. If the report is not ready ' +
  'yet, returns a structured error; wait and retry or check run status with get_run_details.';

const inputObject = z.object({
  simulation_uuid: z.string().describe('The simulation run’s uuid.'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

const REPORT_NOT_READY_FIX =
  'The evaluation report is not ready yet. Wait and call get_evaluation_report again, or use ' +
  'get_run_details to see whether the run has finished and an evaluation job exists.';

function isReportNotReady(error: unknown): boolean {
  return (
    error instanceof VerifyaxError &&
    !(error instanceof NotFoundError) &&
    error.message.includes('not available yet')
  );
}

function translateReportError(error: unknown): ToolError {
  if (isReportNotReady(error)) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : String(error),
      suggested_fix: REPORT_NOT_READY_FIX,
    };
  }
  return translateError(error);
}

function projectReport(report: Evaluation): Record<string, unknown> {
  const out: Record<string, unknown> = {
    uuid: report.uuid ?? null,
    simulation_uuid: report.simulation_uuid ?? null,
    current_status: report.current_status ?? null,
    current_progress_text: report.current_progress_text ?? null,
    progress_percentage: report.progress_percentage ?? null,
    error_details: report.error_details ?? null,
    created_at: report.created_at ?? null,
    updated_at: report.updated_at ?? null,
    evaluation: report.evaluation ?? null,
  };
  return out;
}

export function createGetEvaluationReportHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(
      ctx,
      NAME,
      async () => {
        const report = await ctx.client.simulations.getEvaluationReport(args.simulation_uuid);
        return { report: projectReport(report) };
      },
      translateReportError
    );
}

export function registerGetEvaluationReport(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Get evaluation report',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createGetEvaluationReportHandler(ctx)
  );
}
