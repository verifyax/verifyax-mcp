import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('usage', () => {
  it('lists events filtered by simulation', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${API_BASE}/usage/events`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([{ event_uuid: 'ev1' }]);
      })
    );

    const events = await makeClient().usage.listEvents({ simulation_uuid: 'run-1', failed: false });

    expect(events).toHaveLength(1);
    expect(seenUrl).toContain('simulation_uuid=run-1');
    expect(seenUrl).toContain('failed=false');
  });

  it('gets a single event', async () => {
    server.use(
      http.get(`${API_BASE}/usage/events/ev1`, () => HttpResponse.json({ event_uuid: 'ev1' }))
    );

    const event = await makeClient().usage.getEvent('ev1');

    expect(event.event_uuid).toBe('ev1');
  });

  it('lists calls for an event', async () => {
    server.use(
      http.get(`${API_BASE}/usage/calls`, () => HttpResponse.json([{ model_name: 'claude' }]))
    );

    const calls = await makeClient().usage.listCalls({ event_uuid: 'ev1' });

    expect(calls).toHaveLength(1);
  });
});
