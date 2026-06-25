import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { RateLimitError, VerifyaxError } from '../../src/index.js';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('transport retries', () => {
  it('retries a 429 and then succeeds', async () => {
    let calls = 0;
    server.use(
      http.get(`${API_BASE}/agents`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({ message: 'slow down' }, { status: 429 });
        }
        return HttpResponse.json([{ uuid: 'a1', name: 'one', agent_type: 'A2A' }]);
      })
    );

    const agents = await makeClient({ retryBaseMs: 1 }).agents.list();
    expect(calls).toBe(2);
    expect(agents[0]?.uuid).toBe('a1');
  });

  it('retries transient 503s', async () => {
    let calls = 0;
    server.use(
      http.get(`${API_BASE}/agents/a1`, () => {
        calls += 1;
        if (calls < 3) {
          return HttpResponse.json({ message: 'unavailable' }, { status: 503 });
        }
        return HttpResponse.json({ uuid: 'a1', name: 'one', agent_type: 'A2A' });
      })
    );

    const agent = await makeClient({ retryBaseMs: 1 }).agents.get('a1');
    expect(calls).toBe(3);
    expect(agent.uuid).toBe('a1');
  });

  it('gives up after maxRetries and throws RateLimitError', async () => {
    let calls = 0;
    server.use(
      http.get(`${API_BASE}/agents/a1`, () => {
        calls += 1;
        return HttpResponse.json({ message: 'slow down' }, { status: 429 });
      })
    );

    await expect(
      makeClient({ retryBaseMs: 1, maxRetries: 2 }).agents.get('a1')
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toBe(3); // initial + 2 retries
  });

  it('does not retry non-retryable statuses', async () => {
    let calls = 0;
    server.use(
      http.get(`${API_BASE}/agents/a1`, () => {
        calls += 1;
        return HttpResponse.json({ message: 'nope' }, { status: 400 });
      })
    );

    await expect(makeClient({ retryBaseMs: 1 }).agents.get('a1')).rejects.toBeInstanceOf(
      VerifyaxError
    );
    expect(calls).toBe(1);
  });
});
