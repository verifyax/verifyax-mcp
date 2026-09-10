import { JobFailedError } from '@verifyax/sdk';
import { translateError } from '../error-translation.js';
import { toolResult } from '../tools/result.js';
import type { GenerateScenarioWork, TaskRefreshOutcome } from './types.js';

const TERMINAL_JOB_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export async function refreshGenerateScenarioWork(
  work: GenerateScenarioWork
): Promise<TaskRefreshOutcome> {
  const job = await work.ctx.client.jobs.get(work.jobUuid);
  const status = job.current_status;

  if (!TERMINAL_JOB_STATUSES.has(status)) {
    return {
      status: 'working',
      statusMessage: `Scenario generation ${status.toLowerCase()}`,
    };
  }

  if (status === 'COMPLETED') {
    const payload: Record<string, unknown> = {
      success: true,
      scenario_uuid: work.scenarioUuid,
      scenario_type: work.scenarioType,
      job_status: status,
    };
    if (work.isBatch && work.batchUuid !== undefined) {
      payload.batch_uuid = work.batchUuid;
    }
    if (work.isBatch && work.batchScenarioUuids !== undefined) {
      payload.batch_scenario_uuids = work.batchScenarioUuids;
    }
    return {
      status: 'completed',
      statusMessage: 'Scenario generation completed',
      result: toolResult(payload),
    };
  }

  const error = new JobFailedError(`Job ${work.jobUuid} ended in ${status}`, {
    jobUuid: work.jobUuid,
    jobStatus: status,
    ...(job.error_details !== undefined ? { errorDetails: job.error_details } : {}),
  });
  work.ctx.logger.error('generate_scenario failed', {
    error: error.message,
  });
  return {
    status: 'completed',
    statusMessage: `Generation ${status.toLowerCase()}`,
    result: toolResult(translateError(error), true),
  };
}
