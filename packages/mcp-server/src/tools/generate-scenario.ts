import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GenerateScenarioRequest } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'generate_scenario';

const DESCRIPTION =
  'Generates a new test scenario of a given type (info_exchange or interview) with optional skill ' +
  'tags and context, then blocks until generation finishes (typically 30s–2min). Returns the new ' +
  'scenario’s uuid, or a structured error with details if generation fails (e.g. incompatible tags).';

// Generation can take a couple of minutes; allow generous headroom.
const POLL_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 3_000;

const inputObject = z.object({
  name: z.string().describe('Workspace-unique scenario name.'),
  scenario_type: z.enum(['info_exchange', 'interview']),
  tags: z
    .array(z.string())
    .optional()
    .describe('Skill tag names (use list_compatible_tags to pick valid ones).'),
  context_prompt: z.string().optional(),
  description: z.string().optional(),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export function createGenerateScenarioHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const request: GenerateScenarioRequest = {
        name: args.name,
        scenario_type: args.scenario_type,
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.context_prompt !== undefined ? { context_prompt: args.context_prompt } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
      };
      const generated = await ctx.client.scenarios.generate(request);

      // Block until the async generation job reaches a terminal state. A FAILED
      // job throws JobFailedError (carrying error_details), surfaced by runTool.
      const job = await ctx.client.jobs.pollUntilTerminal(generated.job_uuid, {
        timeoutMs: POLL_TIMEOUT_MS,
        intervalMs: POLL_INTERVAL_MS,
      });

      return {
        scenario_uuid: generated.uuid,
        scenario_type: args.scenario_type,
        job_status: job.current_status,
      };
    });
}

export function registerGenerateScenario(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    { title: 'Generate scenario', description: DESCRIPTION, inputSchema },
    createGenerateScenarioHandler(ctx)
  );
}
