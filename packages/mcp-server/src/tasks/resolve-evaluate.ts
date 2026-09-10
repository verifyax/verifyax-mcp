import { JobFailedError, VerifyaxError } from '@verifyax/sdk';
import { translateError } from '../error-translation.js';
import { toolResult } from '../tools/result.js';
import type { EvaluateAgentWork, TaskRefreshOutcome } from './types.js';

const TERMINAL_RUN_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const TERMINAL_JOB_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export async function refreshEvaluateAgentWork(
  work: EvaluateAgentWork,
  isTaskActive: () => Promise<boolean>
): Promise<TaskRefreshOutcome> {
  if (work.phase === 'run') {
    return refreshRunPhase(work, isTaskActive);
  }
  return refreshEvalPhase(work);
}

async function refreshRunPhase(
  work: EvaluateAgentWork,
  isTaskActive: () => Promise<boolean>
): Promise<TaskRefreshOutcome> {
  const run = await work.ctx.client.simulations.get(work.simulationUuid);
  const status = run.status;

  if (!TERMINAL_RUN_STATUSES.has(status)) {
    return {
      status: 'working',
      statusMessage: `Simulation run ${status.toLowerCase().replace('_', ' ')}`,
    };
  }

  if (status === 'FAILED' || status === 'CANCELLED') {
    const runErrorDetails = typeof run.error_details === 'string' ? run.error_details : undefined;
    const error = new JobFailedError(`Run ${work.simulationUuid} ended in ${status}`, {
      jobUuid: work.simulationUuid,
      jobStatus: status,
      ...(runErrorDetails !== undefined ? { errorDetails: runErrorDetails } : {}),
    });
    work.ctx.logger.error('evaluate_agent run failed', { error: error.message });
    return {
      status: 'completed',
      statusMessage: `Run ${status.toLowerCase()}`,
      result: toolResult(translateError(error), true),
    };
  }

  let evalJobUuid =
    work.evalJobUuid ?? run.evaluation_job_uuid ?? run.evaluation_jobs?.at(-1)?.uuid;
  if (!evalJobUuid) {
    if (!(await isTaskActive())) {
      return {
        status: 'working',
        statusMessage: 'Task cancelled',
      };
    }
    try {
      const triggered = await work.ctx.client.simulations.triggerEvaluation(work.simulationUuid);
      evalJobUuid = triggered.evaluation_job_uuid ?? triggered.job_uuid;
    } catch (error) {
      work.ctx.logger.error('evaluate_agent could not start evaluation', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: 'completed',
        statusMessage: 'Evaluation could not be started',
        result: toolResult(
          translateError(
            new VerifyaxError(
              `The run ${work.simulationUuid} completed (${status}) but no evaluation could be ` +
                'started for it. Confirm the scenario defines evaluation ground truth, then retry, ' +
                'or inspect the run with get_run_details.'
            )
          ),
          true
        ),
      };
    }
  }

  if (!evalJobUuid) {
    return {
      status: 'completed',
      statusMessage: 'Evaluation could not be started',
      result: toolResult(
        translateError(
          new VerifyaxError(
            `The run ${work.simulationUuid} completed (${status}) but no evaluation could be ` +
              'started for it. Confirm the scenario defines evaluation ground truth, then retry, ' +
              'or inspect the run with get_run_details.'
          )
        ),
        true
      ),
    };
  }

  work.evalJobUuid = evalJobUuid;
  work.phase = 'eval';

  const evalJob = await work.ctx.client.jobs.get(evalJobUuid);
  if (!TERMINAL_JOB_STATUSES.has(evalJob.current_status)) {
    return {
      status: 'working',
      statusMessage: `Evaluation job ${evalJob.current_status.toLowerCase()}`,
    };
  }

  return finishEvaluation(work, evalJobUuid, evalJob.current_status, evalJob.error_details, status);
}

async function refreshEvalPhase(work: EvaluateAgentWork): Promise<TaskRefreshOutcome> {
  const evalJobUuid = work.evalJobUuid;
  if (!evalJobUuid) {
    return {
      status: 'failed',
      statusMessage: 'Evaluation job uuid missing',
    };
  }

  const evalJob = await work.ctx.client.jobs.get(evalJobUuid);
  if (!TERMINAL_JOB_STATUSES.has(evalJob.current_status)) {
    return {
      status: 'working',
      statusMessage: `Evaluation job ${evalJob.current_status.toLowerCase()}`,
    };
  }

  const run = await work.ctx.client.simulations.get(work.simulationUuid);
  return finishEvaluation(
    work,
    evalJobUuid,
    evalJob.current_status,
    evalJob.error_details,
    run.status
  );
}

async function finishEvaluation(
  work: EvaluateAgentWork,
  evalJobUuid: string,
  evalStatus: string,
  errorDetails: string | undefined,
  runStatus: string
): Promise<TaskRefreshOutcome> {
  if (evalStatus === 'FAILED' || evalStatus === 'CANCELLED') {
    const error = new JobFailedError(`Job ${evalJobUuid} ended in ${evalStatus}`, {
      jobUuid: evalJobUuid,
      jobStatus: evalStatus,
      ...(errorDetails !== undefined ? { errorDetails } : {}),
    });
    work.ctx.logger.error('evaluate_agent evaluation failed', { error: error.message });
    return {
      status: 'completed',
      statusMessage: `Evaluation ${evalStatus.toLowerCase()}`,
      result: toolResult(translateError(error), true),
    };
  }

  const evaluation = await work.ctx.client.simulations.getEvaluation(evalJobUuid);
  return {
    status: 'completed',
    statusMessage: 'Evaluation completed',
    result: toolResult({
      success: true,
      simulation_uuid: work.simulationUuid,
      run_status: runStatus,
      credits_estimate: work.creditsEstimate,
      evaluation,
    }),
  };
}
