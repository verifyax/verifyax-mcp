import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  AuthError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  VerifyaxError,
  VerifyaxClient,
} from '../../src/index.js';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('VerifyaxClient transport', () => {
  it('rejects construction without an API key', () => {
    expect(() => new VerifyaxClient({ apiKey: '' })).toThrow(VerifyaxError);
  });

  it('supports environment variable fallback for API key and base URLs', () => {
    const keys = ['VERIFYAX_API_KEY', 'VERIFYAX_BASE_URL', 'VERIFYAX_WEB_BASE_URL'];
    const saved: Record<string, string | undefined> = {};
    for (const key of keys) {
      saved[key] = process.env[key];
    }

    process.env.VERIFYAX_API_KEY = 'env-key';
    process.env.VERIFYAX_BASE_URL = 'https://env-base.com/api/v1';
    process.env.VERIFYAX_WEB_BASE_URL = 'https://env-web.com/web/api/v1';

    try {
      const client = new VerifyaxClient();
      const internalClient = client as unknown as {
        apiKey: string;
        baseUrl: string;
        webBaseUrl: string;
      };
      expect(internalClient.apiKey).toBe('env-key');
      expect(internalClient.baseUrl).toBe('https://env-base.com/api/v1');
      expect(internalClient.webBaseUrl).toBe('https://env-web.com/web/api/v1');
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = saved[key];
        }
      }
    }
  });

  it('falls back to production defaults when env base URLs are empty', () => {
    const keys = ['VERIFYAX_API_KEY', 'VERIFYAX_BASE_URL', 'VERIFYAX_WEB_BASE_URL'];
    const saved: Record<string, string | undefined> = {};
    for (const key of keys) {
      saved[key] = process.env[key];
    }

    process.env.VERIFYAX_API_KEY = 'env-key';
    process.env.VERIFYAX_BASE_URL = '';
    process.env.VERIFYAX_WEB_BASE_URL = '   ';

    try {
      const client = new VerifyaxClient();
      const internalClient = client as unknown as {
        baseUrl: string;
        webBaseUrl: string;
      };
      expect(internalClient.baseUrl).toBe('https://console.verifyax.com/api/v1');
      expect(internalClient.webBaseUrl).toBe('https://console.verifyax.com/web/api/v1');
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = saved[key];
        }
      }
    }
  });

  it('allows options to override environment variable fallbacks', () => {
    const keys = ['VERIFYAX_API_KEY', 'VERIFYAX_BASE_URL', 'VERIFYAX_WEB_BASE_URL'];
    const saved: Record<string, string | undefined> = {};
    for (const key of keys) {
      saved[key] = process.env[key];
    }

    process.env.VERIFYAX_API_KEY = 'env-key';
    process.env.VERIFYAX_BASE_URL = 'https://env-base.com/api/v1';
    process.env.VERIFYAX_WEB_BASE_URL = 'https://env-web.com/web/api/v1';

    try {
      const client = new VerifyaxClient({
        apiKey: 'override-key',
        baseUrl: 'https://override-base.com/api/v1',
        webBaseUrl: 'https://override-web.com/web/api/v1',
      });
      const internalClient = client as unknown as {
        apiKey: string;
        baseUrl: string;
        webBaseUrl: string;
      };
      expect(internalClient.apiKey).toBe('override-key');
      expect(internalClient.baseUrl).toBe('https://override-base.com/api/v1');
      expect(internalClient.webBaseUrl).toBe('https://override-web.com/web/api/v1');
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = saved[key];
        }
      }
    }
  });

  it('sends the bearer token and serializes query params', async () => {
    let seenAuth: string | null = null;
    let seenUrl = '';
    server.use(
      http.get(`${API_BASE}/agents`, ({ request }) => {
        seenAuth = request.headers.get('authorization');
        seenUrl = request.url;
        return HttpResponse.json([]);
      })
    );

    await makeClient().agents.list({ agent_type: 'A2A', limit: 50 });

    expect(seenAuth).toBe('Bearer test-key');
    expect(seenUrl).toContain('agent_type=A2A');
    expect(seenUrl).toContain('limit=50');
  });

  it('sends a JSON body with Content-Type on writes', async () => {
    let contentType: string | null = null;
    let received: unknown;
    server.use(
      http.post(`${API_BASE}/agents`, async ({ request }) => {
        contentType = request.headers.get('content-type');
        received = await request.json();
        return HttpResponse.json({ uuid: 'a1', name: 'n', agent_type: 'A2A' }, { status: 201 });
      })
    );

    const agent = await makeClient().agents.create({ name: 'n', agent_url: 'https://x' });

    expect(contentType).toBe('application/json');
    expect(received).toEqual({ name: 'n', agent_url: 'https://x' });
    expect(agent.uuid).toBe('a1');
  });

  it('returns undefined for an empty (204) body', async () => {
    server.use(http.delete(`${API_BASE}/agents/a1`, () => new HttpResponse(null, { status: 204 })));

    await expect(makeClient().agents.delete('a1')).resolves.toBeUndefined();
  });

  it.each([
    [401, AuthError],
    [403, AuthError],
    [404, NotFoundError],
    [409, ConflictError],
    [429, RateLimitError],
    [500, VerifyaxError],
  ])('maps HTTP %i to the right error class', async (status, ErrorClass) => {
    server.use(
      http.get(`${API_BASE}/agents/a1`, () =>
        HttpResponse.json({ message: 'boom', statusCode: status }, { status })
      )
    );

    // maxRetries: 0 so retryable statuses (429) map immediately instead of backing off.
    const error = await makeClient({ maxRetries: 0 })
      .agents.get('a1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorClass);
    expect((error as VerifyaxError).statusCode).toBe(status);
    expect((error as VerifyaxError).message).toBe('boom');
  });

  it('captures retry-after on 429', async () => {
    server.use(
      http.get(`${API_BASE}/agents/a1`, () =>
        HttpResponse.json(
          { message: 'slow down' },
          { status: 429, headers: { 'Retry-After': '12' } }
        )
      )
    );

    const error = (await makeClient({ maxRetries: 0 })
      .agents.get('a1')
      .catch((e: unknown) => e)) as RateLimitError;

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfter).toBe(12);
  });

  it('throws TimeoutError when a request exceeds the deadline', async () => {
    server.use(
      http.get(`${API_BASE}/agents/a1`, async () => {
        await delay(200);
        return HttpResponse.json({ uuid: 'a1' });
      })
    );

    await expect(makeClient({ timeoutMs: 20 }).agents.get('a1')).rejects.toBeInstanceOf(
      TimeoutError
    );
  });
});
