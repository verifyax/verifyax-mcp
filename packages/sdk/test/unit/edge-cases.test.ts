import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { NotFoundError, TimeoutError, VerifyaxError } from '../../src/index.js';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('transport edge cases', () => {
  it('wraps a network failure as VerifyaxError (not a raw error)', async () => {
    const client = makeClient({
      fetch: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    const error = await client.agents.list().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VerifyaxError);
    expect(error).not.toBeInstanceOf(TimeoutError);
    expect((error as VerifyaxError).message).toContain('Network request');
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    server.use(
      http.get(
        `${API_BASE}/agents/a1`,
        () => new HttpResponse('<html>oops</html>', { status: 500 })
      )
    );
    const error = (await makeClient()
      .agents.get('a1')
      .catch((e: unknown) => e)) as VerifyaxError;
    expect(error).toBeInstanceOf(VerifyaxError);
    expect(error.statusCode).toBe(500);
    expect(error.message).toContain('status 500');
  });

  it('returns a non-JSON 2xx body as raw text rather than throwing', async () => {
    server.use(
      http.get(`${API_BASE}/agents/a1`, () => new HttpResponse('plain text', { status: 200 }))
    );
    // Transport returns the raw text; callers that expect JSON shapes get the string.
    const raw = await makeClient().request<string>('GET', '/agents/a1');
    expect(raw).toBe('plain text');
  });

  it('propagates a NotFoundError if the resource is deleted mid-poll', async () => {
    server.use(
      http.get(`${API_BASE}/jobs/job-x`, () =>
        HttpResponse.json({ message: 'job not found' }, { status: 404 })
      )
    );
    await expect(
      makeClient().jobs.pollUntilTerminal('job-x', { intervalMs: 1 })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns an empty array for an empty workspace', async () => {
    server.use(http.get(`${API_BASE}/agents`, () => HttpResponse.json([])));
    await expect(makeClient().agents.list()).resolves.toEqual([]);
  });
});
