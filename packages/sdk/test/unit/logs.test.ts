import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('logs.list', () => {
  it('lists audit entries with the from/to window', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${API_BASE}/logs`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([{ action: 'agent.create', actor: 'user@x' }]);
      })
    );

    const entries = await makeClient().logs.list({
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
      action: 'agent.create',
    });

    expect(entries).toHaveLength(1);
    expect(seenUrl).toContain('from=2026-01-01');
    expect(seenUrl).toContain('action=agent.create');
  });
});
