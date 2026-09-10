import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { VerifyaxError } from '@verifyax/sdk';
import { z } from 'zod';
import type { VerifyaxTaskStore } from '../tasks/store.js';
import { TASK_TTL_BUFFER_MS } from '../tasks/types.js';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'evaluate_agent';

const DESCRIPTION =
  'Runs an agent against a scenario and evaluates the result end to end. Typically takes 30s–30min; ' +
  'task-capable MCP clients receive a pollable task handle immediately, while others block until the ' +
  'evaluation completes. Give it an agent uuid and a scenario uuid; it previews cost, runs the ' +
  'simulation, waits for it, and returns the evaluation scores. Optional timeout_minutes (1–240) ' +
  'overrides the scenario default for this run.';

// The full pipeline (run + evaluation) can take several minutes.
const DEFAULT_POLL_TIMEOUT_MS = 600_000;
const EVAL_BUFFER_MS = 300_000;
const RUN_INTERVAL_MS = 15_000;
const EVAL_INTERVAL_MS = 10_000;
const TASK_POLL_INTERVAL_MS = 10_000;

/** Scale client-side polling to cover the requested run budget plus evaluation headroom. */
export function evaluatePollTimeoutMs(timeoutMinutes?: number): number {
  if (timeoutMinutes === undefined) {
    return DEFAULT_POLL_TIMEOUT_MS;
  }
  return timeoutMinutes * 60_000 + EVAL_BUFFER_MS;
}

const inputObject = z.object({
  agent_uuid: z.string().describe('The agent to evaluate.'),
  scenario_uuid: z.string().describe('The scenario to run the agent against.'),
  num_runs: z
    .number()
    .int()
    .positive()
    .max(10)
    .optional()
    .describe('Parallel repetitions, 1-10 (default 1).'),
  timeout_minutes: z
    .number()
    .int()
    .min(1)
    .max(240)
    .optional()
    .describe('Wall-clock budget in minutes for this run (overrides scenario default).'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

async function previewCredits(ctx: ToolContext, args: Input): Promise<number | null> {
  try {
    const preview = await ctx.client.simulations.creditPreview({
      mode: 'scenario_run',
      scenario_uuid: args.scenario_uuid,
      agent_uuid: args.agent_uuid,
      num_runs: args.num_runs ?? 1,
      ...(args.timeout_minutes !== undefined ? { timeout_minutes: args.timeout_minutes } : {}),
    });
    return preview.newRunEstimatedCredits ?? null;
  } catch (error) {
    ctx.logger.debug('credit preview failed; continuing', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Start the simulation run (evaluation queued on completion). */
export async function startEvaluateAgent(ctx: ToolContext, args: Input) {
  const creditsEstimate = await previewCredits(ctx, args);
  const sim = await ctx.client.simulations.simulate({
    scenario_uuid: args.scenario_uuid,
    agent_uuid: args.agent_uuid,
    evaluate_on_complete: true,
    ...(args.num_runs !== undefined ? { num_runs: args.num_runs } : {}),
    ...(args.timeout_minutes !== undefined ? { timeout_minutes: args.timeout_minutes } : {}),
  });
  return {
    simulationUuid: sim.simulation_uuid,
    creditsEstimate,
    evalJobUuid: sim.evaluation_job_uuid,
  };
}

export function createEvaluateAgentHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const pollTimeoutMs = evaluatePollTimeoutMs(args.timeout_minutes);
      const started = await startEvaluateAgent(ctx, args);

      const run = await ctx.client.simulations.waitForRun(started.simulationUuid, {
        timeoutMs: pollTimeoutMs,
        intervalMs: RUN_INTERVAL_MS,
      });

      let evalJobUuid =
        started.evalJobUuid ?? run.evaluation_job_uuid ?? run.evaluation_jobs?.at(-1)?.uuid;
      if (!evalJobUuid) {
        const triggered = await ctx.client.simulations.triggerEvaluation(started.simulationUuid);
        evalJobUuid = triggered.evaluation_job_uuid ?? triggered.job_uuid;
      }

      if (!evalJobUuid) {
        throw new VerifyaxError(
          `The run ${started.simulationUuid} completed (${run.status}) but no evaluation could be ` +
            'started for it. Confirm the scenario defines evaluation ground truth, then retry, ' +
            'or inspect the run with get_run_details.'
        );
      }

      await ctx.client.jobs.pollUntilTerminal(evalJobUuid, {
        timeoutMs: pollTimeoutMs,
        intervalMs: EVAL_INTERVAL_MS,
      });
      const evaluation = await ctx.client.simulations.getEvaluation(evalJobUuid);

      return {
        simulation_uuid: started.simulationUuid,
        run_status: run.status,
        credits_estimate: started.creditsEstimate,
        evaluation,
      };
    });
}

export function registerEvaluateAgent(
  server: McpServer,
  ctx: ToolContext,
  taskStore: VerifyaxTaskStore
): void {
  server.experimental.tasks.registerToolTask(
    NAME,
    {
      title: 'Evaluate agent',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      execution: { taskSupport: 'optional' },
    },
    {
      createTask: async (args, extra) => {
        const started = await startEvaluateAgent(ctx, args);
        const pollBudgetMs = evaluatePollTimeoutMs(args.timeout_minutes);
        const task = await extra.taskStore.createTask({
          ttl: pollBudgetMs + TASK_TTL_BUFFER_MS,
          pollInterval: TASK_POLL_INTERVAL_MS,
        });
        taskStore.setWork(task.taskId, {
          kind: 'evaluate_agent',
          ctx,
          simulationUuid: started.simulationUuid,
          creditsEstimate: started.creditsEstimate,
          phase: 'run',
          ...(started.evalJobUuid !== undefined ? { evalJobUuid: started.evalJobUuid } : {}),
        });
        return { task };
      },
      getTask: async (_args, extra) => {
        const task = await extra.taskStore.getTask(extra.taskId);
        if (!task) {
          throw new Error(`Task ${extra.taskId} not found`);
        }
        return task;
      },
      getTaskResult: async (_args, extra) => {
        const result = await extra.taskStore.getTaskResult(extra.taskId);
        return result as CallToolResult;
      },
    }
  );
}
