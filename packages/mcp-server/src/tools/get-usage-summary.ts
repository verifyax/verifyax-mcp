import type { ListUsageEventsParams, UsageEvent } from '@verifyax/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'get_usage_summary';

const DESCRIPTION =
  'Summarizes VerifyAX usage events over an optional time range or for a specific simulation or ' +
  'scenario. Paginates across all matching events (up to a cap) and returns the total event ' +
  'count, a breakdown by product area, and total credits when the API reports them.';

/** Page size and overall safety cap when paginating usage events. */
const PAGE_SIZE = 1000;
const DEFAULT_MAX_EVENTS = 10_000;

const inputObject = z.object({
  simulation_uuid: z.string().optional(),
  scenario_uuid: z.string().optional(),
  product_area: z.string().optional(),
  failed: z.boolean().optional(),
  event_start_from: z.string().optional().describe('ISO 8601 start of the window.'),
  event_start_to: z.string().optional().describe('ISO 8601 end of the window.'),
  max_events: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Cap on events to summarize (default ${String(DEFAULT_MAX_EVENTS)}).`),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

export interface UsageSummary {
  total_events: number;
  by_product_area: Record<string, number>;
  total_credits: number | null;
  /** True when the cap was hit and the summary covers only part of the range. */
  truncated: boolean;
}

/** Fetch usage events across pages until a short page or the cap is reached. */
async function fetchAllEvents(
  ctx: ToolContext,
  filter: ListUsageEventsParams,
  cap: number
): Promise<{ events: UsageEvent[]; truncated: boolean }> {
  const events: UsageEvent[] = [];
  for (let offset = 0; events.length < cap; offset += PAGE_SIZE) {
    const page = await ctx.client.usage.listEvents({ ...filter, limit: PAGE_SIZE, offset });
    events.push(...page);
    if (page.length < PAGE_SIZE) {
      // Last page (no more data). It can still overshoot the cap, so trim and
      // flag truncation only when we actually dropped events.
      return { events: events.slice(0, cap), truncated: events.length > cap };
    }
  }
  // Stopped because we hit the cap on full pages — more events may remain.
  return { events: events.slice(0, cap), truncated: true };
}

/** Aggregate raw usage events into counts by product area and a credits total. */
export function summarizeUsage(events: UsageEvent[]): Omit<UsageSummary, 'truncated'> {
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
      const { max_events, ...filter } = args;
      const cap = max_events ?? DEFAULT_MAX_EVENTS;
      const { events, truncated } = await fetchAllEvents(ctx, filter, cap);
      return { ...summarizeUsage(events), truncated };
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
