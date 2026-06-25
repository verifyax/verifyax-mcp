// VerifyaxClient — the HTTP transport plus resource accessors.
//
// new VerifyaxClient({ apiKey }) wires up resource-oriented accessors
// (client.agents, client.scenarios, ...) that delegate back to request().

import { TimeoutError, VerifyaxError, errorFromResponse } from './errors.js';
import { AgentsResource } from './resources/agents.js';
import { JobsResource } from './resources/jobs.js';
import { ScenariosResource } from './resources/scenarios.js';
import { SimulationsResource } from './resources/simulations.js';
import { TagsResource } from './resources/tags.js';
import { UsageResource } from './resources/usage.js';

const DEFAULT_BASE_URL = 'https://console.verifyax.com/api/v1';
const DEFAULT_WEB_BASE_URL = 'https://console.verifyax.com/web/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Minimal fetch signature the client depends on (overridable for tests). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VerifyaxClientOptions {
  apiKey: string;
  /** Override the `/api/v1` base. Defaults to the production gateway. */
  baseUrl?: string;
  /** Override the `/web/api/v1` base used by the tag catalogue. */
  webBaseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
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
  signal?: AbortSignal;
}

export class VerifyaxClient {
  readonly agents: AgentsResource;
  readonly scenarios: ScenariosResource;
  readonly simulations: SimulationsResource;
  readonly jobs: JobsResource;
  readonly tags: TagsResource;
  readonly usage: UsageResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: VerifyaxClientOptions) {
    if (!options.apiKey) {
      throw new VerifyaxError('A VerifyAX API key is required to construct the client.');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = stripTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    this.webBaseUrl = stripTrailingSlash(options.webBaseUrl ?? DEFAULT_WEB_BASE_URL);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

    this.agents = new AgentsResource(this);
    this.scenarios = new ScenariosResource(this);
    this.simulations = new SimulationsResource(this);
    this.jobs = new JobsResource(this);
    this.tags = new TagsResource(this);
    this.usage = new UsageResource(this);
  }

  /**
   * Perform an HTTP request and return the parsed JSON body as `T`.
   * Translates non-2xx responses into the typed error hierarchy and request
   * timeouts into {@link TimeoutError}. Returns `undefined` for empty bodies.
   */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const base = options.base === 'web' ? this.webBaseUrl : this.baseUrl;
    const url = buildUrl(base, path, options.query);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.auth !== false) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    if (options.signal) {
      forwardAbort(options.signal, controller);
    }
    init.signal = controller.signal;

    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (cause) {
      if (controller.signal.aborted && !isExternalAbort(options.signal)) {
        throw new TimeoutError(`Request to ${path} timed out after ${this.timeoutMs}ms`, {
          timeoutMs: this.timeoutMs,
          cause,
        });
      }
      throw new VerifyaxError(`Network request to ${path} failed`, { cause });
    } finally {
      clearTimeout(timer);
    }

    const parsed = await parseBody(response);
    if (!response.ok) {
      throw errorFromResponse(response.status, parsed, retryAfterSeconds(response));
    }
    return parsed as T;
  }
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
