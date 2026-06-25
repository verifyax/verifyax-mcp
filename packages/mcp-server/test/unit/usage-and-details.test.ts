import type { UsageEvent } from '@verifyax/sdk';
import { describe, expect, it } from 'vitest';
import { createGetRunDetailsHandler } from '../../src/tools/get-run-details.js';
import { createGetUsageSummaryHandler, summarizeUsage } from '../../src/tools/get-usage-summary.js';
import { payloadOf, stubContext } from './helpers.js';

describe('summarizeUsage', () => {
  it('counts by product area and sums credits when present', () => {
    const events: UsageEvent[] = [
      { product_area: 'scenario_run', credits: 3 },
      { product_area: 'scenario_run', credits: 2 },
      { product_area: 'evaluation', credits: 5 },
      { product_area: undefined },
    ];
    const summary = summarizeUsage(events);
    expect(summary.total_events).toBe(4);
    expect(summary.by_product_area).toEqual({ scenario_run: 2, evaluation: 1, unknown: 1 });
    expect(summary.total_credits).toBe(10);
  });

  it('reports null credits when no event carries a numeric credit', () => {
    expect(summarizeUsage([{ product_area: 'x' }]).total_credits).toBeNull();
  });
});

describe('get_usage_summary', () => {
  it('aggregates events from the API', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/usage/events',
        body: [
          { product_area: 'scenario_run', credits: 4 },
          { product_area: 'scenario_run', credits: 1 },
        ],
      },
    ]);
    const payload = payloadOf<{ total_events: number; total_credits: number }>(
      await createGetUsageSummaryHandler(ctx)({ simulation_uuid: 'r1' })
    );
    expect(payload.total_events).toBe(2);
    expect(payload.total_credits).toBe(5);
  });
});

describe('get_run_details', () => {
  it('includes the evaluation when an evaluation job exists', async () => {
    const { ctx } = stubContext([
      { method: 'GET', match: '/simulations/evaluations/', body: { overall_score: 0.9 } },
      {
        method: 'GET',
        match: '/simulations/r1',
        body: { uuid: 'r1', status: 'COMPLETED', evaluation_job_uuid: 'eval-1' },
      },
    ]);
    const payload = payloadOf<{ status: string; evaluation: { overall_score: number } | null }>(
      await createGetRunDetailsHandler(ctx)({ simulation_uuid: 'r1' })
    );
    expect(payload.status).toBe('COMPLETED');
    expect(payload.evaluation?.overall_score).toBe(0.9);
  });

  it('returns null evaluation when none is queued', async () => {
    const { ctx } = stubContext([
      { method: 'GET', match: '/simulations/r2', body: { uuid: 'r2', status: 'IN_PROGRESS' } },
    ]);
    const payload = payloadOf<{ evaluation: unknown }>(
      await createGetRunDetailsHandler(ctx)({ simulation_uuid: 'r2' })
    );
    expect(payload.evaluation).toBeNull();
  });
});
