// VerifyaxClient — the HTTP transport plus resource accessors.
//
// new VerifyaxClient({ apiKey }) wires up resource-oriented accessors
// (client.agents, client.scenarios, ...) that delegate back to request().

import { TimeoutError, VerifyaxError, errorFromResponse } from './errors.js';
import { AgentsResource } from './resources/agents.js';
import { JobsResource } from './resources/jobs.js';
import { LogsResource } from './resources/logs.js';
import { ScenariosResource } from './resources/scenarios.js';
import { SimulationsResource } from './resources/simulations.js';
import { TagsResource } from './resources/tags.js';
import { UsageResource } from './resources/usage.js';

const DEFAULT_BASE_URL = 'https://console.verifyax.com/api/v1';
const DEFAULT_WEB_BASE_URL = 'https://console.verifyax.com/web/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const MAX_BACKOFF_MS = 20_000;

/** HTTP statuses worth retrying: rate limiting and transient gateway errors. */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/**
 * Methods safe to auto-retry on a transient gateway error (502/503/504): the
 * backend may already have processed the request, so only replay ones that are
 * idempotent by HTTP semantics. A 429 is safe for any method (the server
 * rejected it before acting), so POST is retried only on 429 — never on a
 * transient error, which would risk duplicate, credit-consuming work.
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

/** Minimal fetch signature the client depends on (overridable for tests). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VerifyaxClientOptions {
  /** Your VerifyAX API key. Defaults to process.env.VERIFYAX_API_KEY if available. */
  apiKey?: string;
  /** Override the `/api/v1` base. Defaults to process.env.VERIFYAX_BASE_URL if available, else production gateway. */
  baseUrl?: string;
  /** Override the `/web/api/v1` base used by the tag catalogue. Defaults to process.env.VERIFYAX_WEB_BASE_URL if available, else production gateway. */
  webBaseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
  /** Max automatic retries for 429/transient failures. Defaults to 3. */
  maxRetries?: number;
  /** Base backoff delay in ms (doubled per attempt). Defaults to 500. */
  retryBaseMs?: number;
  /** Inject a fetch implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike;
}

export type QueryValue = string | number | boolean | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  body?: unknown;
  query?: QueryParams;
  /** Which base URL to use: the authed API (default) or the public web route. */
  base?: 'api' | 'web';
  /** Send the Authorization header. Defaults to true; the tag route sets false. */
  auth?: boolean;
  /** Parse the success body as JSON (default) or return raw bytes for binary downloads. */
  responseType?: 'json' | 'arrayBuffer';
  signal?: AbortSignal;
}

export class VerifyaxClient {
  readonly agents: AgentsResource;
  readonly scenarios: ScenariosResource;
  readonly simulations: SimulationsResource;
  readonly jobs: JobsResource;
  readonly tags: TagsResource;
  readonly usage: UsageResource;
  readonly logs: LogsResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: VerifyaxClientOptions = {}) {
    const globalProcess = typeof process !== 'undefined' ? process : undefined;
    const apiKey = options.apiKey ?? globalProcess?.env?.VERIFYAX_API_KEY;
    if (!apiKey) {
      throw new VerifyaxError('A VerifyAX API key is required to construct the client.');
    }
    this.apiKey = apiKey;

    const envBaseUrl = globalProcess?.env?.VERIFYAX_BASE_URL;
    this.baseUrl = stripTrailingSlash(
      resolveBaseUrl(options.baseUrl, envBaseUrl, DEFAULT_BASE_URL)
    );

    const envWebBaseUrl = globalProcess?.env?.VERIFYAX_WEB_BASE_URL;
    this.webBaseUrl = stripTrailingSlash(
      resolveBaseUrl(options.webBaseUrl, envWebBaseUrl, DEFAULT_WEB_BASE_URL)
    );

    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

    this.agents = new AgentsResource(this);
    this.scenarios = new ScenariosResource(this);
    this.simulations = new SimulationsResource(this);
    this.jobs = new JobsResource(this);
    this.tags = new TagsResource(this);
    this.usage = new UsageResource(this);
    this.logs = new LogsResource(this);
  }

  /**
   * Perform an HTTP request and return the parsed JSON body as `T`.
   * Retries 429 and transient gateway errors with exponential backoff (honoring
   * Retry-After), translates non-2xx responses into the typed error hierarchy,
   * and request timeouts into {@link TimeoutError}. Returns `undefined` for empty bodies.
   */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const base = options.base === 'web' ? this.webBaseUrl : this.baseUrl;
    const url = buildUrl(base, path, options.query);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.auth !== false) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchOnce(method, url, path, headers, body, options.signal);

      if (response.ok) {
        if (options.responseType === 'arrayBuffer') {
          // Binary download (e.g. run artifacts) — return raw bytes, don't parse.
          return new Uint8Array(await response.arrayBuffer()) as T;
        }
        return (await parseBody(response)) as T;
      }

      const parsed = await parseBody(response);
      const retryAfter = retryAfterSeconds(response);
      const retryable =
        RETRYABLE_STATUSES.has(response.status) &&
        (response.status === 429 || IDEMPOTENT_METHODS.has(method.toUpperCase()));
      if (retryable && attempt < this.maxRetries) {
        await sleep(this.backoffMs(attempt, retryAfter), options.signal);
        continue;
      }
      throw errorFromResponse(response.status, parsed, retryAfter);
    }
  }

  /** One fetch attempt with its own timeout, mapping aborts/network failures. */
  private async fetchOnce(
    method: string,
    url: string,
    path: string,
    headers: Record<string, string>,
    body: string | undefined,
    externalSignal: AbortSignal | undefined
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (externalSignal) {
      forwardAbort(externalSignal, controller);
    }
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined) {
      init.body = body;
    }
    try {
      return await this.fetchImpl(url, init);
    } catch (cause) {
      if (controller.signal.aborted && !isExternalAbort(externalSignal)) {
        throw new TimeoutError(`Request to ${path} timed out after ${String(this.timeoutMs)}ms`, {
          timeoutMs: this.timeoutMs,
          cause,
        });
      }
      throw new VerifyaxError(`Network request to ${path} failed`, { cause });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Backoff delay: Retry-After header if present, else exponential from the base. */
  private backoffMs(attempt: number, retryAfterSecs: number | undefined): number {
    if (retryAfterSecs !== undefined) {
      return Math.min(retryAfterSecs * 1000, MAX_BACKOFF_MS);
    }
    return Math.min(this.retryBaseMs * 2 ** attempt, MAX_BACKOFF_MS);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new VerifyaxError('Request aborted'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      reject(new VerifyaxError('Request aborted'));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Treat empty or whitespace-only strings as unset so env overrides do not block defaults. */
function resolveBaseUrl(
  option: string | undefined,
  env: string | undefined,
  fallback: string
): string {
  for (const candidate of [option, env, fallback]) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function buildUrl(base: string, path: string, query?: QueryParams): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let url = `${base}${normalizedPath}`;
  if (query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        search.append(key, String(value));
      }
    }
    const qs = search.toString();
    if (qs) {
      url += `?${qs}`;
    }
  }
  return url;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (header === null) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function forwardAbort(signal: AbortSignal, controller: AbortController): void {
  if (signal.aborted) {
    controller.abort();
    return;
  }
  signal.addEventListener('abort', () => controller.abort(), { once: true });
}

function isExternalAbort(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}
