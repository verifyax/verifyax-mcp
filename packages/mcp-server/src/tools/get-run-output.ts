import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunOutput } from '@verifyax/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import { runTool } from './result.js';

const NAME = 'get_run_output';

const DEFAULT_MAX_CHARS = 12_000;
const HARD_MAX_CHARS = 32_000;

const DESCRIPTION =
  'Fetches the structured dialogue output for a simulation run by its uuid. Read-only. Returns the ' +
  'transcript or scenario output JSON, truncated to a default cap of 12000 characters so a full run ' +
  'does not overflow context; optional max_chars overrides the cap (up to 32000). States clearly what ' +
  'was omitted when truncated. Use get_evaluation_report for scores without the transcript.';

const inputObject = z.object({
  simulation_uuid: z.string().describe('The simulation run’s uuid.'),
  max_chars: z
    .number()
    .int()
    .positive()
    .max(HARD_MAX_CHARS)
    .optional()
    .describe(
      `Maximum characters to return (default ${String(DEFAULT_MAX_CHARS)}, max ${String(HARD_MAX_CHARS)}).`
    ),
});
type Input = z.infer<typeof inputObject>;
const inputSchema = inputObject.shape;

function isMessageLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function flattenMessages(output: RunOutput): unknown[] | null {
  if (Array.isArray(output)) {
    if (output.length === 0 || output.every(isMessageLike)) {
      return output;
    }
    return null;
  }

  if (Array.isArray(output.messages) && output.messages.every(isMessageLike)) {
    return output.messages;
  }

  if (Array.isArray(output.rounds)) {
    const flat: unknown[] = [];
    for (const round of output.rounds) {
      if (round !== null && typeof round === 'object' && !Array.isArray(round)) {
        const msgs = (round as Record<string, unknown>).messages;
        if (Array.isArray(msgs)) {
          flat.push(...msgs);
        }
      }
    }
    if (flat.length > 0) {
      return flat;
    }
  }

  return null;
}

function truncateMessageList(
  messages: unknown[],
  maxChars: number
): {
  output: unknown;
  truncated: boolean;
  turns_included: number;
  turns_omitted: number;
  omitted_chars?: number;
} | null {
  const wrapper = { messages };
  const full = JSON.stringify(wrapper, null, 2);
  if (full.length <= maxChars) {
    return {
      output: wrapper,
      truncated: false,
      turns_included: messages.length,
      turns_omitted: 0,
    };
  }

  const included: unknown[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const candidate = { messages: [...included, messages[i]] };
    const serialized = JSON.stringify(candidate, null, 2);
    if (serialized.length > maxChars) {
      if (included.length === 0) {
        return null;
      }
      return {
        output: { messages: included },
        truncated: true,
        turns_included: included.length,
        turns_omitted: messages.length - included.length,
      };
    }
    included.push(messages[i]);
  }

  return {
    output: { messages: included },
    truncated: false,
    turns_included: included.length,
    turns_omitted: 0,
  };
}

function truncateJsonOutput(
  output: RunOutput,
  maxChars: number
): {
  output: unknown;
  truncated: boolean;
  omitted_chars: number;
} {
  const full = JSON.stringify(output, null, 2);
  if (full.length <= maxChars) {
    return { output, truncated: false, omitted_chars: 0 };
  }
  const cut = full.slice(0, maxChars);
  return {
    output: cut,
    truncated: true,
    omitted_chars: full.length - maxChars,
  };
}

export function shapeRunOutput(output: RunOutput, maxChars: number): Record<string, unknown> {
  const messages = flattenMessages(output);
  if (messages !== null) {
    const shaped = truncateMessageList(messages, maxChars);
    if (shaped !== null) {
      return {
        simulation_output: shaped.output,
        truncated: shaped.truncated,
        max_chars: maxChars,
        turns_included: shaped.turns_included,
        turns_omitted: shaped.turns_omitted,
        ...(shaped.omitted_chars !== undefined ? { omitted_chars: shaped.omitted_chars } : {}),
      };
    }
  }

  const shaped = truncateJsonOutput(output, maxChars);
  return {
    simulation_output: shaped.output,
    truncated: shaped.truncated,
    max_chars: maxChars,
    ...(shaped.truncated
      ? {
          truncation_note:
            'Output was truncated as pretty-printed JSON; call again with a higher max_chars (up to 32000) to recover omitted content, or use get_run_details for run metadata.',
          omitted_chars: shaped.omitted_chars,
        }
      : {}),
  };
}

export function createGetRunOutputHandler(ctx: ToolContext) {
  return (args: Input) =>
    runTool(ctx, NAME, async () => {
      const maxChars = args.max_chars ?? DEFAULT_MAX_CHARS;
      const raw = await ctx.client.simulations.getOutput(args.simulation_uuid);
      return {
        simulation_uuid: args.simulation_uuid,
        ...shapeRunOutput(raw, maxChars),
      };
    });
}

export function registerGetRunOutput(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    NAME,
    {
      title: 'Get run output',
      description: DESCRIPTION,
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    createGetRunOutputHandler(ctx)
  );
}
