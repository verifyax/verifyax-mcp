import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { WEB_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('tags.list', () => {
  it('hits the web base without auth and unwraps the { data } envelope', async () => {
    let seenAuth: string | null = 'unset';
    server.use(
      http.get(`${WEB_BASE}/tags`, ({ request }) => {
        seenAuth = request.headers.get('authorization');
        return HttpResponse.json({
          success: true,
          data: [
            { name: 'empathy', allowed_scenario_types: ['info_exchange', 'interview'] },
            { name: 'qna_general', benchmark_family: 'qna', allowed_scenario_types: ['interview'] },
          ],
        });
      })
    );

    const tags = await makeClient().tags.list();

    expect(seenAuth).toBeNull();
    expect(tags).toHaveLength(2);
    expect(tags[0]?.name).toBe('empathy');
  });
});
