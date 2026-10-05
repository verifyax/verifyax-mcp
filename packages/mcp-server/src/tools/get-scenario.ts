import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Scenario } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'get_scenario';

const DESCRIPTION =
  'Fetches one test scenario by uuid with enough detail to reuse it for preview_run_cost or ' +
  'evaluate_agent. Read-only. Returns uuid, name, type, status, description, tags when present, ' +
  'and context_prompt when the record includes it. If tags are missing from the response, reuse tags ' +
  'from generation time or ask the user.';

const inputObject = z.object({
  scenario_uuid: z.string().describe('The scenario’s uuid.'),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

const TAGS_MISSING_NOTE =
  'Tags were not included on this scenario record. Reuse the tags from when the scenario was ' +
  'generated, or ask the user which tags apply.';

function readContextPrompt(scenario: Scenario): string | null {
  if (typeof scenario.context_prompt === 'string' && scenario.context_prompt.length > 0) {
    return scenario.context_prompt;
  }
  const params = scenario.creation_parameters;
  if (params !== null && typeof params === 'object' && !Array.isArray(params)) {
    const nested = (params as Record<string, unknown>).context_prompt;
    if (typeof nested === 'string' && nested.length > 0) {
      return nested;
    }
  }
  return null;
}

function projectScenario(scenario: Scenario): Record<string, unknown> {
  const tags = scenario.tags;
  const hasTagsArray = Array.isArray(tags);

  const out: Record<string, unknown> = {
    uuid: scenario.uuid,
    name: scenario.name,
    scenario_type: scenario.scenario_type ?? null,
    status: scenario.status ?? null,
    description: typeof scenario.description === 'string' ? scenario.description : null,
    tags: hasTagsArray ? tags : null,
  };

  const contextPrompt = readContextPrompt(scenario);
  if (contextPrompt !== null) {
    out.context_prompt = contextPrompt;
  }

  if (!hasTagsArray) {
    out.tags_note = TAGS_MISSING_NOTE;
  }

  return out;
}

export function createGetScenarioHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const scenario = await ctx.client.scenarios.get(args.scenario_uuid);
      return { scenario: projectScenario(scenario) };
    });
}

export function registerGetScenario(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Get scenario',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createGetScenarioHandler(ctx)
  );
}
