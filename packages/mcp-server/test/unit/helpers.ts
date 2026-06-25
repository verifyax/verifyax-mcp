import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { VerifyaxClient } from '@verifyax/sdk';
import { createLogger } from '../../src/logging.js';
import type { ToolContext } from '../../src/tools/context.js';

export interface StubRoute {
  /** HTTP method to match (defaults to any). */
  method?: string;
  /** Substring the request URL must contain. First matching route wins. */
  match: string;
  status?: number;
  body?: unknown;
}

export interface CapturedCall {
  method: string;
  url: string;
  body: unknown;
}

export interface Stub {
  ctx: ToolContext;
  calls: CapturedCall[];
}

/** Build a ToolContext whose SDK client is backed by a routed fetch stub. */
export function stubContext(routes: StubRoute[]): Stub {
  const calls: CapturedCall[] = [];

  const client = new VerifyaxClient({
    apiKey: 'test',
    baseUrl: 'https://api.test/api/v1',
    webBaseUrl: 'https://api.test/web/api/v1',
    // Tool tests assert exact call counts; retry behavior is covered in the SDK.
    maxRetries: 0,
    fetch: async (url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const rawBody = init?.body;
      calls.push({
        method,
        url,
        body: typeof rawBody === 'string' ? JSON.parse(rawBody) : (rawBody ?? null),
      });
      const route = routes.find(
        (r) => url.includes(r.match) && (r.method ? r.method.toUpperCase() === method : true)
      );
      if (!route) {
        return new Response(JSON.stringify({ message: `no stub for ${method} ${url}` }), {
          status: 599,
          headers: { 'content-type': 'application/json' },
        });
      }
      const status = route.status ?? 200;
      const hasBody = route.body !== undefined;
      return new Response(hasBody ? JSON.stringify(route.body) : null, {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  return { ctx: { client, logger: createLogger({ level: 'silent' }) }, calls };
}

/** Parse the JSON payload from a tool result's text content block. */
export function payloadOf<T = Record<string, unknown>>(result: CallToolResult): T {
  const block = result.content?.[0];
  if (block && block.type === 'text') {
    return JSON.parse(block.text) as T;
  }
  throw new Error('tool result had no text content block');
}
