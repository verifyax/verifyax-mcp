import type { VerifyaxClient } from '../client.js';
import type {
  GenerateScenarioRequest,
  GenerateScenarioResponse,
  Job,
  ListScenariosParams,
  Scenario,
  UpdateScenarioRequest,
} from '../types.js';

// Peripheral endpoints (copy, generate-copy, artifacts, validation) are
// deliberately omitted in Phase 1 — none of the v1 MCP tools need them.

/** Scenarios API — test environments tagged with skill tags. */
export class ScenariosResource {
  constructor(private readonly client: VerifyaxClient) {}

  /**
   * Start scenario generation (async). Returns the new scenario `uuid` and the
   * `job_uuid` to poll. Tag-count is validated here; tag existence and
   * scenario-type compatibility are validated later by the worker, so the job
   * can still end FAILED — poll it before running simulations.
   */
  async generate(body: GenerateScenarioRequest): Promise<GenerateScenarioResponse> {
    return this.client.request<GenerateScenarioResponse>('POST', '/scenarios/generate', { body });
  }

  async list(params: ListScenariosParams = {}): Promise<Scenario[]> {
    return this.client.request<Scenario[]>('GET', '/scenarios', { query: params });
  }

  async get(scenarioUuid: string): Promise<Scenario> {
    return this.client.request<Scenario>('GET', `/scenarios/${scenarioUuid}`);
  }

  async update(scenarioUuid: string, body: UpdateScenarioRequest): Promise<Scenario> {
    return this.client.request<Scenario>('PATCH', `/scenarios/${scenarioUuid}`, { body });
  }

  /** Delete a scenario. Returns 409 (ConflictError) if runs still reference it. */
  async delete(scenarioUuid: string): Promise<void> {
    await this.client.request<void>('DELETE', `/scenarios/${scenarioUuid}`);
  }

  /** The generation job tied to a scenario. */
  async getJob(scenarioUuid: string): Promise<Job> {
    return this.client.request<Job>('GET', `/scenarios/${scenarioUuid}/job`);
  }
}
