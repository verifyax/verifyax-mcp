import type { VerifyaxClient } from '../client.js';
import { JobFailedError } from '../errors.js';
import { type PollOptions, pollUntilTerminal } from '../polling.js';
import type {
  BatchSimulationScoresEnvelope,
  CreditPreview,
  CreditPreviewRequest,
  Evaluation,
  EvaluationScores,
  ListRunsParams,
  RunOutput,
  SimulateRequest,
  SimulateResponse,
  SimulationEvaluationEnvelope,
  SimulationRun,
  SimulationScoreEnvelope,
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
    const response = await this.client.request<SimulationRun[] | { items: SimulationRun[] }>(
      'GET',
      '/simulations',
      { query: params }
    );
    if (Array.isArray(response)) {
      return response;
    }
    return response?.items ?? [];
  }

  /** Runs for a single scenario. */
  async listForScenario(scenarioUuid: string): Promise<SimulationRun[]> {
    return this.client.request<SimulationRun[]>('GET', `/simulations/scenarios/${scenarioUuid}`);
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

  /** Gateway reporting shortcut — the evaluation payload for a run. */
  async getEvaluationReport(simulationUuid: string): Promise<Evaluation> {
    const envelope = await this.client.request<SimulationEvaluationEnvelope>(
      'GET',
      `/simulations/${simulationUuid}/evaluation`
    );
    // `data` is optional on the envelope schema but always present on success.
    return envelope.data ?? ({} as Evaluation);
  }

  /** Just the scores ({ overall_score, per_tag_scores, ... }) for a run. */
  async getEvaluationScores(simulationUuid: string): Promise<EvaluationScores> {
    const envelope = await this.client.request<SimulationScoreEnvelope>(
      'GET',
      `/simulations/${simulationUuid}/evaluation/scores`
    );
    return envelope.data;
  }

  /** Batch scores for multiple runs by uuid. */
  async getScores(simulationUuids: string[]): Promise<Record<string, EvaluationScores>> {
    const envelope = await this.client.request<BatchSimulationScoresEnvelope>(
      'GET',
      '/simulations/scores',
      { query: { ids: simulationUuids.join(',') } }
    );
    return envelope.data.scores as Record<string, EvaluationScores>;
  }

  /** Parsed JSON run output (ScenarioOutput / response.json) for a completed run. */
  async getOutput(simulationUuid: string): Promise<RunOutput> {
    return this.client.request<RunOutput>('GET', `/simulations/${simulationUuid}/output`);
  }

  /**
   * Download a binary run artifact (transcripts, evidence, evaluation outputs).
   * `path` is relative to the run directory and must start with `files/`.
   * Returns the raw bytes — write them to disk; don't JSON-parse.
   */
  async downloadFile(simulationUuid: string, path: string): Promise<Uint8Array> {
    return this.client.request<Uint8Array>('GET', `/simulations/${simulationUuid}/files`, {
      query: { path },
      responseType: 'arrayBuffer',
    });
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
