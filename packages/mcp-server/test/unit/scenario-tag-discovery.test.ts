import { describe, expect, it } from 'vitest';
import { createRecommendScenarioTagsHandler } from '../../src/tools/recommend-scenario-tags.js';
import { createSearchScenarioTagsHandler } from '../../src/tools/search-scenario-tags.js';
import { payloadOf, stubContext } from './helpers.js';

describe('recommend_scenario_tags', () => {
  it('returns recommended tags in order', async () => {
    const { ctx } = stubContext([
      {
        method: 'POST',
        match: '/scenarios/tag-recommendation',
        body: [
          {
            name: 'empathy',
            category: 'social',
            description: 'Empathy',
            benchmark_family: null,
            allowed_scenario_types: ['interview'],
            custom: false,
          },
        ],
      },
    ]);
    const payload = payloadOf<{ success: boolean; count: number; tags: { name: string }[] }>(
      await createRecommendScenarioTagsHandler(ctx)({
        scenario_type: 'interview',
        context_prompt: 'returns desk',
      })
    );
    expect(payload.success).toBe(true);
    expect(payload.count).toBe(1);
    expect(payload.tags[0]?.name).toBe('empathy');
  });

  it('rejects missing context without calling the API', async () => {
    const { ctx, calls } = stubContext([]);
    const result = await createRecommendScenarioTagsHandler(ctx)({ scenario_type: 'interview' });
    const payload = payloadOf<{ success: boolean; suggested_fix?: string }>(result);
    expect(result.isError).toBe(true);
    expect(payload.success).toBe(false);
    expect(payload.suggested_fix).toContain('context_prompt');
    expect(calls).toHaveLength(0);
  });

  it('maps 404 to list_agents hint', async () => {
    const { ctx } = stubContext([
      {
        method: 'POST',
        match: '/scenarios/tag-recommendation',
        status: 404,
        body: { message: 'agent not found' },
      },
    ]);
    const payload = payloadOf<{ suggested_fix?: string }>(
      await createRecommendScenarioTagsHandler(ctx)({
        scenario_type: 'interview',
        agent_uuid: '00000000-0000-0000-0000-000000000001',
      })
    );
    expect(payload.suggested_fix).toContain('list_agents');
  });

  it('maps 503 to fallback tools', async () => {
    const { ctx } = stubContext([
      {
        method: 'POST',
        match: '/scenarios/tag-recommendation',
        status: 503,
        body: { message: 'recommender unavailable' },
      },
    ]);
    const payload = payloadOf<{ suggested_fix?: string }>(
      await createRecommendScenarioTagsHandler(ctx)({
        scenario_type: 'info_exchange',
        context_prompt: 'support call',
      })
    );
    expect(payload.suggested_fix).toContain('search_scenario_tags');
  });

  it('maps 504 to fallback tools', async () => {
    const { ctx } = stubContext([
      {
        method: 'POST',
        match: '/scenarios/tag-recommendation',
        status: 504,
        body: { message: 'timeout' },
      },
    ]);
    const payload = payloadOf<{ suggested_fix?: string }>(
      await createRecommendScenarioTagsHandler(ctx)({
        scenario_type: 'info_exchange',
        context_prompt: 'support call',
      })
    );
    expect(payload.suggested_fix).toContain('list_compatible_tags');
  });
});

describe('search_scenario_tags', () => {
  it('returns ranked tag names', async () => {
    const { ctx, calls } = stubContext([
      {
        method: 'POST',
        match: '/scenarios/tag-search',
        body: { success: true, data: { skill_tags: ['a', 'b'] } },
      },
    ]);
    const payload = payloadOf<{ success: boolean; skill_tags: string[] }>(
      await createSearchScenarioTagsHandler(ctx)({
        scenario_type: 'info_exchange',
        query: 'de-escalate',
        limit: 10,
      })
    );
    expect(payload.success).toBe(true);
    expect(payload.skill_tags).toEqual(['a', 'b']);
    expect(calls[0]?.body).toMatchObject({ limit: 10 });
  });

  it('maps 429 to list_compatible_tags hint', async () => {
    const { ctx } = stubContext([
      {
        method: 'POST',
        match: '/scenarios/tag-search',
        status: 429,
        body: { error: 'Too many requests', statusCode: 429 },
      },
    ]);
    const payload = payloadOf<{ suggested_fix?: string }>(
      await createSearchScenarioTagsHandler(ctx)({
        scenario_type: 'interview',
        query: 'listening',
      })
    );
    expect(payload.suggested_fix).toMatch(/list_compatible_tags|Retry-After/i);
  });
});
