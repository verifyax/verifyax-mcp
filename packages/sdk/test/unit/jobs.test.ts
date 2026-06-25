import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { JobFailedError, TimeoutError } from '../../src/index.js';
import { API_BASE, server } from '../server.js';
import { makeClient } from '../helpers.js';

describe('jobs.pollUntilTerminal', () => {
  it('polls through PROCESSING and resolves on COMPLETED', async () => {
    const statuses = ['PENDING', 'PROCESSING', 'COMPLETED'];
    let call = 0;
    server.use(
      http.get(`${API_BASE}/jobs/job-1`, () => {
        const status = statuses[Math.min(call, statuses.length - 1)];
        call += 1;
        return HttpResponse.json({ uuid: 'job-1', current_status: status });
      })
    );

    const job = await makeClient().jobs.pollUntilTerminal('job-1', { intervalMs: 1 });

    expect(job.current_status).toBe('COMPLETED');
    expect(call).toBeGreaterThanOrEqual(3);
  });

  it('throws JobFailedError carrying error_details on FAILED', async () => {
    server.use(
      http.get(`${API_BASE}/jobs/job-2`, () =>
        HttpResponse.json({
          uuid: 'job-2',
          current_status: 'FAILED',
          error_details: 'tags do not exist in the skill tags registry',
        })
      )
    );

    const error = (await makeClient()
      .jobs.pollUntilTerminal('job-2', { intervalMs: 1 })
      .catch((e: unknown) => e)) as JobFailedError;

    expect(error).toBeInstanceOf(JobFailedError);
    expect(error.jobStatus).toBe('FAILED');
    expect(error.errorDetails).toContain('skill tags registry');
  });

  it('throws TimeoutError if the job never reaches a terminal state', async () => {
    server.use(
      http.get(`${API_BASE}/jobs/job-3`, () =>
        HttpResponse.json({ uuid: 'job-3', current_status: 'PROCESSING' })
      )
    );

    await expect(
      makeClient().jobs.pollUntilTerminal('job-3', { intervalMs: 5, timeoutMs: 30 })
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});
