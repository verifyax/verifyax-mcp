import { describe, expect, it } from 'vitest';
import { createGetEvaluationReportHandler } from '../../src/tools/get-evaluation-report.js';
import { payloadOf, stubContext } from './helpers.js';

describe('get_evaluation_report', () => {
  it('returns the unwrapped evaluation report payload', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations/run-1/evaluation',
        body: {
          success: true,
          data: {
            uuid: 'eval-1',
            simulation_uuid: 'run-1',
            current_status: 'COMPLETED',
            evaluation: { overall_score: 0.82, per_tag_scores: { empathy: 0.9 } },
            user_uuid: 'user-hidden',
          },
        },
      },
    ]);
    const payload = payloadOf<{
      success: boolean;
      report: {
        current_status: string;
        evaluation: { overall_score: number };
        user_uuid?: string;
      };
    }>(await createGetEvaluationReportHandler(ctx)({ simulation_uuid: 'run-1' }));

    expect(payload.success).toBe(true);
    expect(payload.report.current_status).toBe('COMPLETED');
    expect(payload.report.evaluation?.overall_score).toBe(0.82);
    expect(payload.report.user_uuid).toBeUndefined();
  });

  it('returns structured not found for an unknown run', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations/missing/evaluation',
        status: 404,
        body: { message: 'Simulation not found' },
      },
    ]);
    const payload = payloadOf<{ success: boolean; reason: string; suggested_fix?: string }>(
      await createGetEvaluationReportHandler(ctx)({ simulation_uuid: 'missing' })
    );

    expect(payload.success).toBe(false);
    expect(payload.reason).toContain('Not found');
    expect(payload.suggested_fix).toBeTruthy();
  });

  it('returns suggested_fix when the report is not ready yet', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations/run-2/evaluation',
        body: { success: false },
      },
    ]);
    const payload = payloadOf<{ success: boolean; reason: string; suggested_fix?: string }>(
      await createGetEvaluationReportHandler(ctx)({ simulation_uuid: 'run-2' })
    );

    expect(payload.success).toBe(false);
    expect(payload.reason).toContain('not available yet');
    expect(payload.suggested_fix).toContain('get_evaluation_report');
    expect(payload.suggested_fix).toContain('get_run_details');
  });
});
