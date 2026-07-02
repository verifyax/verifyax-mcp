import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VerifyaxError } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'evaluate_agent';

const DESCRIPTION =
  'Runs an agent against a scenario and evaluates the result end to end, blocking until the ' +
  'evaluation completes (typically 30s–5min). Give it an agent uuid and a scenario uuid; it ' +
  'previews cost, runs the simulation, waits for it, and returns the evaluation scores.';

// The full pipeline (run + evaluation) can take several minutes.
const POLL_TIMEOUT_MS = 600_000;
const RUN_INTERVAL_MS = 15_000;
const EVAL_INTERVAL_MS = 10_000;

const inputObject = z.object({
  agent_uuid: z.string().describe('The agent to evaluate.'),
  scenario_uuid: z.string().describe('The scenario to run the agent against.'),
  num_runs: z.number().int().positive().optional().describe('Parallel repetitions (default 1).'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createEvaluateAgentHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      // 1. Cost preview (advisory — don't fail the evaluation if it errors).
      let creditsEstimate: number | null = null;
      try {
        const preview = await ctx.client.simulations.creditPreview({
          mode: 'scenario_run',
          scenario_uuid: args.scenario_uuid,
          agent_uuid: args.agent_uuid,
          ...(args.num_runs !== undefined ? { num_runs: args.num_runs } : {}),
        });
        creditsEstimate = preview.newRunEstimatedCredits ?? null;
      } catch (error) {
        ctx.logger.debug('credit preview failed; continuing', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // 2. Trigger the run with auto-evaluation queued on completion.
      const sim = await ctx.client.simulations.simulate({
        scenario_uuid: args.scenario_uuid,
        agent_uuid: args.agent_uuid,
        evaluate_on_complete: true,
        ...(args.num_runs !== undefined ? { num_runs: args.num_runs } : {}),
      });

      // 3. Wait for the run to finish (throws JobFailedError on FAILED/CANCELLED).
      const run = await ctx.client.simulations.waitForRun(sim.simulation_uuid, {
        timeoutMs: POLL_TIMEOUT_MS,
        intervalMs: RUN_INTERVAL_MS,
      });

      // 4. Resolve the evaluation job. The API may report it on the run's
      // `evaluation_jobs[]` array (take the last) rather than the scalar field;
      // fall back through both before triggering one manually.
      let evalJobUuid =
        sim.evaluation_job_uuid ?? run.evaluation_job_uuid ?? run.evaluation_jobs?.at(-1)?.uuid;
      if (!evalJobUuid) {
        const triggered = await ctx.client.simulations.triggerEvaluation(sim.simulation_uuid);
        evalJobUuid = triggered.evaluation_job_uuid ?? triggered.job_uuid;
      }

      // No evaluation could be resolved or started — fail explicitly rather than
      // returning `evaluation: null` as an apparent success (which reads to the
      // model as "evaluated, no scores").
      if (!evalJobUuid) {
        throw new VerifyaxError(
          `The run ${sim.simulation_uuid} completed (${run.status}) but no evaluation could be ` +
            'started for it. Confirm the scenario defines evaluation ground truth, then retry, ' +
            'or inspect the run with get_run_details.'
        );
      }

      // 5. Wait for the evaluation and fetch its results.
      await ctx.client.jobs.pollUntilTerminal(evalJobUuid, {
        timeoutMs: POLL_TIMEOUT_MS,
        intervalMs: EVAL_INTERVAL_MS,
      });
      const evaluation = await ctx.client.simulations.getEvaluation(evalJobUuid);

      return {
        simulation_uuid: sim.simulation_uuid,
        run_status: run.status,
        credits_estimate: creditsEstimate,
        evaluation,
      };
    });
}

export function registerEvaluateAgent(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Evaluate agent',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    createEvaluateAgentHandler(ctx)
  );
}
