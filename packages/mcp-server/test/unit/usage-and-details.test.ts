import type { UsageEvent } from '@verifyax/sdk';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/logging.js';
import type { ToolContext } from '../../src/tools/context.js';
import { createGetRunDetailsHandler } from '../../src/tools/get-run-details.js';
import { createGetUsageSummaryHandler, summarizeUsage } from '../../src/tools/get-usage-summary.js';
import { payloadOf, stubContext } from './helpers.js';

/** ToolContext whose usage.listEvents returns the given pages in order. */
function pagingContext(pages: UsageEvent[][]): ToolContext {
  let call = 0;
  // Minimal fake — only usage.listEvents is exercised by these tests.
  return {
    logger: createLogger({ level: 'silent' }),
    client: { usage: { listEvents: async () => pages[call++] ?? [] } },
  } as unknown as ToolContext;
}

describe('summarizeUsage', () => {
  it('counts by product area and sums spend when present', () => {
    const events: UsageEvent[] = [
      { product_area: 'scenario_run', actual_total_event_cost: 3 },
      { product_area: 'scenario_run', actual_total_event_cost: 2 },
      { product_area: 'evaluation', actual_total_event_cost: 5 },
      { product_area: undefined },
    ];
    const summary = summarizeUsage(events);
    expect(summary.total_events).toBe(4);
    expect(summary.by_product_area).toEqual({ scenario_run: 2, evaluation: 1, unknown: 1 });
    expect(summary.total_spend_usd).toBe(10);
  });

  it('reports null credits when no event carries a numeric cost', () => {
    expect(summarizeUsage([{ product_area: 'x' }]).total_spend_usd).toBeNull();
  });
});

describe('get_usage_summary', () => {
  it('aggregates events from the API', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/usage/events',
        body: [
          { product_area: 'scenario_run', actual_total_event_cost: 4 },
          { product_area: 'scenario_run', actual_total_event_cost: 1 },
        ],
      },
    ]);
    const payload = payloadOf<{ total_events: number; total_spend_usd: number }>(
      await createGetUsageSummaryHandler(ctx)({ simulation_uuid: 'r1' })
    );
    expect(payload.total_events).toBe(2);
    expect(payload.total_spend_usd).toBe(5);
  });

  it('paginates across pages until a short page (CODE-5)', async () => {
    const fullPage: UsageEvent[] = Array.from({ length: 1000 }, () => ({
      product_area: 'scenario_run',
      actual_total_event_cost: 1,
    }));
    const lastPage: UsageEvent[] = [{ product_area: 'evaluation', actual_total_event_cost: 2 }];
    const payload = payloadOf<{
      total_events: number;
      truncated: boolean;
      total_spend_usd: number;
    }>(await createGetUsageSummaryHandler(pagingContext([fullPage, lastPage]))({}));
    expect(payload.total_events).toBe(1001); // both pages, not just the first 1000
    expect(payload.total_spend_usd).toBe(1002);
    expect(payload.truncated).toBe(false);
  });

  it('flags truncation when the cap is reached', async () => {
    const fullPage: UsageEvent[] = Array.from({ length: 1000 }, () => ({ product_area: 'x' }));
    const payload = payloadOf<{ total_events: number; truncated: boolean }>(
      await createGetUsageSummaryHandler(pagingContext([fullPage, fullPage, fullPage]))({
        max_events: 2000,
      })
    );
    expect(payload.total_events).toBe(2000);
    expect(payload.truncated).toBe(true);
  });

  it('caps and flags truncation when a short final page overshoots the cap', async () => {
    // cap=1500, pages of 1000 + 800: the short page pushes the total to 1800,
    // which must be trimmed to the cap and reported as truncated.
    const fullPage: UsageEvent[] = Array.from({ length: 1000 }, () => ({
      product_area: 'x',
      actual_total_event_cost: 1,
    }));
    const shortPage: UsageEvent[] = Array.from({ length: 800 }, () => ({
      product_area: 'x',
      actual_total_event_cost: 1,
    }));
    const payload = payloadOf<{
      total_events: number;
      truncated: boolean;
      total_spend_usd: number;
    }>(
      await createGetUsageSummaryHandler(pagingContext([fullPage, shortPage]))({ max_events: 1500 })
    );
    expect(payload.total_events).toBe(1500);
    expect(payload.total_spend_usd).toBe(1500); // spend summed only over the capped set
    expect(payload.truncated).toBe(true);
  });

  it('forwards job_uuid filters to usage events', async () => {
    const { ctx, calls } = stubContext([
      {
        method: 'GET',
        match: '/usage/events',
        body: [{ product_area: 'evaluation', actual_total_event_cost: 1 }],
      },
    ]);
    await createGetUsageSummaryHandler(ctx)({
      job_uuid: 'job-1',
      simulation_job_uuid: 'sim-job-1',
      evaluation_job_uuid: 'eval-job-1',
    });
    expect(calls[0]?.url).toContain('job_uuid=job-1');
    expect(calls[0]?.url).toContain('simulation_job_uuid=sim-job-1');
    expect(calls[0]?.url).toContain('evaluation_job_uuid=eval-job-1');
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

  it('still returns the run when the evaluation fetch fails (not ready)', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations/evaluations/',
        status: 404,
        body: { message: 'not ready' },
      },
      {
        method: 'GET',
        match: '/simulations/r3',
        body: { uuid: 'r3', status: 'COMPLETED', evaluation_job_uuid: 'e1' },
      },
    ]);
    const payload = payloadOf<{ success: boolean; status: string; evaluation: unknown }>(
      await createGetRunDetailsHandler(ctx)({ simulation_uuid: 'r3' })
    );
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('COMPLETED');
    expect(payload.evaluation).toBeNull();
  });

  it('resolves the evaluation from evaluation_jobs[] when the scalar is absent', async () => {
    const { ctx } = stubContext([
      { method: 'GET', match: '/simulations/evaluations/', body: { overall_score: 0.77 } },
      {
        method: 'GET',
        match: '/simulations/r7',
        body: { uuid: 'r7', status: 'COMPLETED', evaluation_jobs: [{ uuid: 'e2' }] },
      },
    ]);
    const payload = payloadOf<{
      run: { evaluation_job_uuid: string | null };
      evaluation: { overall_score: number } | null;
    }>(await createGetRunDetailsHandler(ctx)({ simulation_uuid: 'r7' }));
    expect(payload.evaluation?.overall_score).toBe(0.77);
    // The projection must reflect the job resolved from evaluation_jobs[], not null.
    expect(payload.run.evaluation_job_uuid).toBe('e2');
  });

  it('projects the run to a compact named shape, not the raw object (CODE-6)', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations/r8',
        body: {
          uuid: 'r8',
          status: 'COMPLETED',
          agent_uuid: 'a1',
          scenario_uuid: 's1',
          created_at: '2026-07-01T00:00:00Z',
          internal_debug_blob: 'should-not-be-returned',
        },
      },
    ]);
    const payload = payloadOf<{ run: Record<string, unknown> }>(
      await createGetRunDetailsHandler(ctx)({ simulation_uuid: 'r8' })
    );
    expect(payload.run).toMatchObject({ uuid: 'r8', status: 'COMPLETED', agent_uuid: 'a1' });
    expect(payload.run.internal_debug_blob).toBeUndefined();
    expect(Object.keys(payload.run).sort()).toEqual([
      'agent_uuid',
      'created_at',
      'evaluation_job_uuid',
      'scenario_uuid',
      'status',
      'updated_at',
      'uuid',
    ]);
  });
});
