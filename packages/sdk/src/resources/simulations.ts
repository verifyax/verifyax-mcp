import type { VerifyaxClient } from '../client.js';
import { JobFailedError } from '../errors.js';
import { type PollOptions, pollUntilTerminal } from '../polling.js';
import type {
  CreditPreview,
  CreditPreviewRequest,
  Evaluation,
  ListRunsParams,
  SimulateRequest,
  SimulateResponse,
  SimulationRun,
  TriggerEvaluationResponse,
} from '../types.js';

/** Simulation runs and evaluation. */
export class SimulationsResource {
  constructor(private readonly client: VerifyaxClient) {}

  /** Estimate credits for a run before triggering it. */
  async creditPreview(body: CreditPreviewRequest): Promise<CreditPreview> {
    return this.client.request<CreditPreview>('POST', '/engine/workspace-credit-preview', { body });
  }

  /** Trigger a simulation run of an agent against a scenario. */
  async simulate(body: SimulateRequest): Promise<SimulateResponse> {
    return this.client.request<SimulateResponse>('POST', '/engine/simulate/scenario', { body });
  }

  async get(simulationUuid: string): Promise<SimulationRun> {
    return this.client.request<SimulationRun>('GET', `/simulations/${simulationUuid}`);
  }

  async list(params: ListRunsParams = {}): Promise<SimulationRun[]> {
    return this.client.request<SimulationRun[]>('GET', '/simulations', { query: params });
  }

  async cancel(simulationUuid: string): Promise<void> {
    await this.client.request<void>('POST', `/simulations/${simulationUuid}/cancel`);
  }

  /** Delete a run. Terminal runs only. */
  async delete(simulationUuid: string): Promise<void> {
    await this.client.request<void>('DELETE', `/simulations/${simulationUuid}`);
  }

  /** Queue evaluation for a completed run (when not using evaluate_on_complete). */
  async triggerEvaluation(simulationUuid: string): Promise<TriggerEvaluationResponse> {
    return this.client.request<TriggerEvaluationResponse>('POST', '/engine/evaluate/trigger', {
      body: { simulation_uuid: simulationUuid },
    });
  }

  /** Fetch evaluation results by the run's `evaluation_job_uuid`. */
  async getEvaluation(evaluationJobUuid: string): Promise<Evaluation> {
    return this.client.request<Evaluation>('GET', `/simulations/evaluations/${evaluationJobUuid}`);
  }

  /** Poll a run until it reaches COMPLETED, throwing on FAILED/CANCELLED. */
  async waitForRun(simulationUuid: string, options: PollOptions = {}): Promise<SimulationRun> {
    return pollUntilTerminal<SimulationRun>({
      ...options,
      fetchOnce: () => this.get(simulationUuid),
      isSuccess: (run) => run.status === 'COMPLETED',
      isFailure: (run) => run.status === 'FAILED' || run.status === 'CANCELLED',
      onFailure: (run) => {
        throw new JobFailedError(`Run ${simulationUuid} ended in ${run.status}`, {
          jobUuid: simulationUuid,
          jobStatus: run.status,
        });
      },
      describeTimeout: (timeoutMs) =>
        `Run ${simulationUuid} did not complete within ${String(timeoutMs)}ms`,
    });
  }
}
