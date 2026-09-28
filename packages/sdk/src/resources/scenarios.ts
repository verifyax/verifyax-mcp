import type { VerifyaxClient } from '../client.js';
import type {
  GenerateFromQnaRequest,
  GenerateScenarioRequest,
  GenerateScenarioResponse,
  Job,
  ListScenariosParams,
  Scenario,
  Tag,
  TagRecommendationPublicRequest,
  TagSearchPublicRequest,
  TagSearchPublicResponse,
  UpdateScenarioRequest,
} from '../types.js';

// Peripheral endpoints (copy, generate-copy, artifacts, validation) are
// deliberately omitted in Phase 1 — none of the v1 MCP tools need them.

/** Scenarios API — test environments tagged with skill tags. */
export class ScenariosResource {
  constructor(private readonly client: VerifyaxClient) {}

  /**
   * Start scenario generation (async). Returns the new scenario `uuid` and the
   * `job_uuid` to poll. Tag count (422), existence, and scenario-type compatibility
   * (400) are validated synchronously before a job is queued. Interview allows at
   * most one tag; info_exchange allows at most five. Poll the job for other
   * `scenario_creation` failures after a 201 response.
   */
  async generate(body: GenerateScenarioRequest): Promise<GenerateScenarioResponse> {
    return this.client.request<GenerateScenarioResponse>('POST', '/scenarios/generate', { body });
  }

  /**
   * Recommend skill tags (Workbench pipeline: embeddings + LLM, cap ~20). Returns a
   * bare array of tag objects in recommendation order. At least one of
   * `context_prompt` or `agent_uuid` is required.
   */
  async recommendTags(body: TagRecommendationPublicRequest): Promise<Tag[]> {
    return this.client.request<Tag[]>('POST', '/scenarios/tag-recommendation', { body });
  }

  /**
   * Search skill tags by embedding similarity (no LLM). Returns ranked tag names only.
   */
  async searchTags(body: TagSearchPublicRequest): Promise<string[]> {
    const envelope = await this.client.request<TagSearchPublicResponse>(
      'POST',
      '/scenarios/tag-search',
      { body }
    );
    return envelope.data.skill_tags;
  }

  /** Generate an interview scenario from an inline Q&A set (async; poll the job). */
  async generateFromQna(body: GenerateFromQnaRequest): Promise<GenerateScenarioResponse> {
    return this.client.request<GenerateScenarioResponse>('POST', '/scenarios/generate-from-qna', {
      body,
    });
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
