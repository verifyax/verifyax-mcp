import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  AuthError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  VerifyaxError,
} from '../../src/index.js';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('VerifyaxClient transport', () => {
  it('rejects construction without an API key', () => {
    expect(() => makeClient({ apiKey: '' })).toThrow(VerifyaxError);
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

    const error = await makeClient()
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

    const error = (await makeClient()
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
