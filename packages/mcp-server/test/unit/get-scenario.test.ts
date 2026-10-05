import { describe, expect, it } from 'vitest';
import { createGetScenarioHandler } from '../../src/tools/get-scenario.js';
import { payloadOf, stubContext } from './helpers.js';

describe('get_scenario', () => {
  it('returns a compact scenario projection with tags and context from creation_parameters', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/scenarios/scn-1',
        body: {
          uuid: 'scn-1',
          name: 'Support suite',
          scenario_type: 'info_exchange',
          status: 'SUCCESS',
          description: 'Tier-1 support',
          tags: ['empathy', 'active_listening'],
          creation_parameters: { context_prompt: 'Handle angry customers calmly.' },
          workspace_uuid: 'ws-hidden',
        },
      },
    ]);
    const payload = payloadOf<{
      success: boolean;
      scenario: {
        uuid: string;
        tags: string[];
        context_prompt: string;
        tags_note?: string;
      };
    }>(await createGetScenarioHandler(ctx)({ scenario_uuid: 'scn-1' }));

    expect(payload.success).toBe(true);
    expect(payload.scenario).toMatchObject({
      uuid: 'scn-1',
      name: 'Support suite',
      scenario_type: 'info_exchange',
      status: 'SUCCESS',
      description: 'Tier-1 support',
      tags: ['empathy', 'active_listening'],
      context_prompt: 'Handle angry customers calmly.',
    });
    expect(payload.scenario.tags_note).toBeUndefined();
    expect(Object.keys(payload.scenario)).not.toContain('workspace_uuid');
  });

  it('notes missing tags when the record has no tags array', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/scenarios/scn-2',
        body: { uuid: 'scn-2', name: 'Legacy', status: 'SUCCESS' },
      },
    ]);
    const payload = payloadOf<{
      scenario: { tags: null; tags_note: string; context_prompt?: string };
    }>(await createGetScenarioHandler(ctx)({ scenario_uuid: 'scn-2' }));

    expect(payload.scenario.tags).toBeNull();
    expect(payload.scenario.tags_note).toContain('generated');
    expect(payload.scenario.context_prompt).toBeUndefined();
  });

  it('returns structured not found for an unknown uuid', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/scenarios/missing',
        status: 404,
        body: { message: 'Scenario not found' },
      },
    ]);
    const payload = payloadOf<{ success: boolean; reason: string; suggested_fix?: string }>(
      await createGetScenarioHandler(ctx)({ scenario_uuid: 'missing' })
    );

    expect(payload.success).toBe(false);
    expect(payload.reason).toContain('Not found');
    expect(payload.suggested_fix).toBeTruthy();
  });
});
