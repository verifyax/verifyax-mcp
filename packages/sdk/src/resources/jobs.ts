import type { VerifyaxClient } from '../client.js';
import { type PollOptions, pollJob } from '../polling.js';
import type { Job, ListJobsParams } from '../types.js';

/** Jobs API — uniform handle for async operations. */
export class JobsResource {
  constructor(private readonly client: VerifyaxClient) {}

  async list(params: ListJobsParams = {}): Promise<Job[]> {
    return this.client.request<Job[]>('GET', '/jobs', { query: params });
  }

  async get(jobUuid: string): Promise<Job> {
    return this.client.request<Job>('GET', `/jobs/${jobUuid}`);
  }

  async cancel(jobUuid: string): Promise<void> {
    await this.client.request<void>('POST', `/jobs/${jobUuid}/cancel`);
  }

  async retry(jobUuid: string): Promise<void> {
    await this.client.request<void>('POST', `/jobs/${jobUuid}/retry`);
  }

  /** Delete a job. Terminal states only. */
  async delete(jobUuid: string): Promise<void> {
    await this.client.request<void>('DELETE', `/jobs/${jobUuid}`);
  }

  /** Poll until the job reaches COMPLETED, throwing JobFailedError on FAILED/CANCELLED. */
  async pollUntilTerminal(jobUuid: string, options: PollOptions = {}): Promise<Job> {
    return pollJob(this.client, jobUuid, options);
  }
}
