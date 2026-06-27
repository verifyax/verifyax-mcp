import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('tags.list', () => {
  it('hits the authed /api/v1 base and returns the bare array', async () => {
    let seenAuth: string | null = null;
    server.use(
      http.get(`${API_BASE}/tags`, ({ request }) => {
        seenAuth = request.headers.get('authorization');
        return HttpResponse.json([
          {
            name: 'empathy',
            allowed_scenario_types: ['info_exchange', 'interview'],
            custom: false,
          },
          { name: 'qna_general', benchmark_family: 'qna', allowed_scenario_types: ['interview'] },
        ]);
      })
    );

    const tags = await makeClient().tags.list();

    expect(seenAuth).toBe('Bearer test-key');
    expect(tags).toHaveLength(2);
    expect(tags[0]?.name).toBe('empathy');
  });
});
