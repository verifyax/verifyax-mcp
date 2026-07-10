import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'get_run_details';

const DESCRIPTION =
  'Fetches the full details of a single simulation run by its uuid, including its status and the ' +
  'evaluation results when they are available. Use after a run to inspect scores and outcome.';

const inputObject = z.object({
  simulation_uuid: z.string().describe('The run’s uuid.'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createGetRunDetailsHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const run = await ctx.client.simulations.get(args.simulation_uuid);

      // Fetch the evaluation if one has been queued — best effort, since it may
      // not be ready yet. A failure here shouldn't fail the whole tool.
      let evaluation: unknown = null;
      // The API may report the job on `evaluation_jobs[]` (take the last) rather
      // than the scalar field; fall back so scores aren't silently missed.
      const evalJobUuid = run.evaluation_job_uuid ?? run.evaluation_jobs?.at(-1)?.uuid;
      if (typeof evalJobUuid === 'string' && evalJobUuid.length > 0) {
        try {
          evaluation = await ctx.client.simulations.getEvaluation(evalJobUuid);
        } catch (error) {
          ctx.logger.debug('evaluation not available yet', {
            simulation_uuid: args.simulation_uuid,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        simulation_uuid: run.uuid,
        status: run.status,
        // Project to a compact, named shape (matches list_recent_runs) instead of
        // returning the entire raw run object into the model's context.
        run: {
          uuid: run.uuid,
          status: run.status,
          agent_uuid: run.agent_uuid ?? null,
          scenario_uuid: run.scenario_uuid ?? null,
          // Use the resolved job id (scalar OR the evaluation_jobs[] fallback),
          // so a run that only exposes its job via the array doesn't report null
          // here while its scores are fetched fine.
          evaluation_job_uuid: evalJobUuid ?? null,
          created_at: run.created_at ?? null,
          updated_at: run.updated_at ?? null,
        },
        evaluation,
      };
    });
}

export function registerGetRunDetails(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Get run details',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createGetRunDetailsHandler(ctx)
  );
}
