// In-SDK polling helpers (CLAUDE.md decision 7).
//
// pollUntilTerminal is a generic loop; pollJob specialises it for the Jobs API.
// Both are reused by the resource accessors and by SDK consumers directly.

import type { VerifyaxClient } from './client.js';
import { JobFailedError, TimeoutError, VerifyaxError } from './errors.js';
import type { Job } from './types.js';

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_INTERVAL_MS = 2_000;

export interface PollOptions {
  /** Give up after this many milliseconds. Defaults to 5 minutes. */
  timeoutMs?: number;
  /** Delay between polls. Defaults to 2 seconds. */
  intervalMs?: number;
  /** Abort the poll early. */
  signal?: AbortSignal;
}

interface PollConfig<T> extends PollOptions {
  fetchOnce: () => Promise<T>;
  isSuccess: (value: T) => boolean;
  isFailure: (value: T) => boolean;
  /** Throws an appropriate error for a terminal-failure value. */
  onFailure: (value: T) => never;
  describeTimeout: (timeoutMs: number) => string;
}

/** Poll `fetchOnce` until it reports success, failure (throws), or timeout. */
export async function pollUntilTerminal<T>(config: PollConfig<T>): Promise<T> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = await config.fetchOnce();
    if (config.isSuccess(value)) {
      return value;
    }
    if (config.isFailure(value)) {
      config.onFailure(value);
    }
    if (Date.now() + intervalMs >= deadline) {
      throw new TimeoutError(config.describeTimeout(timeoutMs), { timeoutMs });
    }
    await sleep(intervalMs, config.signal);
  }
}

/** Poll a single job until it reaches COMPLETED, throwing on FAILED/CANCELLED. */
export async function pollJob(
  client: VerifyaxClient,
  jobUuid: string,
  options: PollOptions = {}
): Promise<Job> {
  return pollUntilTerminal<Job>({
    ...options,
    fetchOnce: () => client.jobs.get(jobUuid),
    isSuccess: (job) => job.current_status === 'COMPLETED',
    isFailure: (job) => job.current_status === 'FAILED' || job.current_status === 'CANCELLED',
    onFailure: (job) => {
      const details = job.error_details;
      throw new JobFailedError(`Job ${jobUuid} ended in ${job.current_status}`, {
        jobUuid,
        jobStatus: job.current_status,
        ...(details !== undefined ? { errorDetails: details } : {}),
      });
    },
    describeTimeout: (timeoutMs) =>
      `Job ${jobUuid} did not reach a terminal state within ${String(timeoutMs)}ms`,
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new VerifyaxError('Polling was aborted'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      reject(new VerifyaxError('Polling was aborted'));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
