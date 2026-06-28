import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UsageEvent } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'get_usage_summary';

const DESCRIPTION =
  'Summarizes VerifyAX usage events over an optional time range or for a specific simulation or ' +
  'scenario. Returns the total event count, a breakdown by product area, and total credits when ' +
  'reported.';

const inputObject = z.object({
  simulation_uuid: z.string().optional(),
  scenario_uuid: z.string().optional(),
  product_area: z.string().optional(),
  failed: z.boolean().optional(),
  event_start_from: z.string().optional().describe('ISO 8601 start of the window.'),
  event_start_to: z.string().optional().describe('ISO 8601 end of the window.'),
  limit: z.number().int().positive().max(1000).optional(),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export interface UsageSummary {
  total_events: number;
  by_product_area: Record<string, number>;
  total_credits: number | null;
}

/** Aggregate raw usage events into counts by product area and a credits total. */
export function summarizeUsage(events: UsageEvent[]): UsageSummary {
  const byProductArea: Record<string, number> = {};
  let creditsSeen = false;
  let totalCredits = 0;

  for (const event of events) {
    const area = typeof event.product_area === 'string' ? event.product_area : 'unknown';
    byProductArea[area] = (byProductArea[area] ?? 0) + 1;

    const credits = event.credits;
    if (typeof credits === 'number' && Number.isFinite(credits)) {
      creditsSeen = true;
      totalCredits += credits;
    }
  }

  return {
    total_events: events.length,
    by_product_area: byProductArea,
    total_credits: creditsSeen ? totalCredits : null,
  };
}

export function createGetUsageSummaryHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const events = await ctx.client.usage.listEvents(args);
      return { ...summarizeUsage(events) };
    });
}

export function registerGetUsageSummary(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Get usage summary',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createGetUsageSummaryHandler(ctx)
  );
}
