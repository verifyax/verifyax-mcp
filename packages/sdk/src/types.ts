// Shared request/response types for the VerifyAX REST API.
//
// Response interfaces document the fields the SDK relies on and carry an
// `[key: string]: unknown` index signature where the API returns more than the
// reference (docs/verifyax-api.md) pins down — forward-compatible without `any`.
//
// Payload shapes that the OpenAPI spec names are aliased onto the generated
// schemas in `types.gen.ts` (the single source of truth — see
// scripts/sync-sdk-spec.sh) rather than re-described by hand. Request shapes and
// the resource-facing helpers below stay hand-written.

import type { components } from './types.gen.js';

/** Component schemas generated from the canonical OpenAPI spec. */
type Schemas = components['schemas'];

// ---------------------------------------------------------------------------
// Enums (string unions — the API uses UPPERCASE for statuses)
// ---------------------------------------------------------------------------

/** Generic async-job lifecycle. */
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** Scenario generation status (distinct enum: SUCCESS, not COMPLETED). */
export type ScenarioStatus = 'INIT' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

/** Simulation run status (distinct enum: CREATED / IN_PROGRESS). */
export type RunStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type AgentType = 'A2A' | 'API' | 'DIRECTLINE' | 'EXTENSION' | 'MCP';
export type ScenarioType = 'info_exchange' | 'interview';
export type AuthMethod = 'no-auth' | 'bearer' | 'cs' | 'http-basic';
export type IncludeFullContext = 'always' | 'never' | 'first_only';
export type DirectLineRegion =
  | 'global'
  | 'europe'
  | 'india'
  | 'unitedstates'
  | 'asia'
  | 'australia'
  | 'northamerica';

/**
 * Common pagination params accepted by list endpoints. The index signature
 * lets these param bags pass directly as URL query parameters (every value is
 * a primitive the query builder can serialize).
 */
export interface ListParams {
  limit?: number;
  offset?: number;
  [key: string]: string | number | boolean | undefined;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/** Copilot Studio Direct Line connection (DIRECTLINE agents). */
export interface DirectLineParameters {
  secret: string;
  region?: DirectLineRegion;
  base_url?: string | null;
}

/** Remote MCP server connection, reached via the catalogue MCP adapter (MCP agents). */
export interface McpParameters {
  url: string;
  auth_method?: 'bearer' | 'none';
  token?: string;
  transport?: 'streamable-http' | 'sse' | 'auto';
  enabled_tools?: string[];
}

export interface AgentParameters {
  auth_method?: AuthMethod;
  token?: string;
  basic_username?: string;
  basic_password?: string;
  /** DIRECTLINE only — Copilot Studio Direct Line secret + region. */
  directline?: DirectLineParameters;
  /** MCP only — remote MCP server URL + credentials. */
  mcp?: McpParameters;
  include_full_context?: IncludeFullContext;
  include_message_history?: boolean;
  max_requests_per_minute?: number;
  timeout?: number;
  /** A2A output modes the agent should produce. */
  default_output_modes?: string[];
  agent_card_url?: string;
  agent_card_path?: string;
}

export interface RegisterAgentRequest {
  name: string;
  description?: string;
  agent_url?: string;
  agent_type?: AgentType;
  agent_parameters?: AgentParameters;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  agent_url?: string;
  agent_type?: AgentType;
  agent_parameters?: AgentParameters;
}

export interface Agent {
  uuid: string;
  name: string;
  agent_type: AgentType;
  agent_url?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AgentCardTestRequest {
  agent_url: string;
  agent_type?: AgentType;
  agent_parameters?: AgentParameters;
}

/** The agent-card connectivity probe result; the spec doesn't schema the body. */
export interface AgentCardTestResult {
  [key: string]: unknown;
}

export interface ApiAgentTestRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ApiAgentCurlTestRequest {
  curl_command: string;
  timeout?: number;
}

/** Copilot Studio (Direct Line) connectivity probe. Flat body (secret/region at top level). */
export interface ApiAgentDirectlineTestRequest {
  secret: string;
  region?: string;
  message?: string;
  timeout?: number;
}

/** A2A card + message probe (optionally runs mini-sims when agent_uuid is set). */
export interface A2aConnectionTestRequest {
  agent_url: string;
  agent_type?: AgentType;
  agent_parameters?: AgentParameters;
  message?: string;
  agent_uuid?: string;
}

/** Single lightweight A2A message probe. */
export interface A2aMessageTestRequest {
  agent_url: string;
  agent_type?: AgentType;
  agent_parameters?: AgentParameters;
  message: string;
}

/** Discover an MCP server's tools and optionally probe the catalogue adapter. */
export interface McpConnectionTestRequest {
  mcp_url: string;
  auth_method?: 'bearer' | 'none';
  token?: string;
  transport?: 'streamable-http' | 'sse' | 'auto';
  agent_url?: string;
  agent_uuid?: string;
  agent_parameters?: Record<string, unknown>;
  message?: string;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export interface GenerateScenarioRequest {
  name: string;
  scenario_type: ScenarioType;
  context_prompt?: string;
  tags?: string[];
  num_scenarios?: number;
  // Batch-only fields (num_scenarios > 1).
  tag_pool?: string[];
  include_tags?: string[];
  total_tags?: number;
  max_tags_per_npc?: number;
  // Note: run-time timeout moved to SimulateRequest.timeout_minutes (not accepted here).
}

export interface QnaQuestion {
  question: string;
  correct_answer?: string;
  is_hallucination_trap?: boolean;
}

/** Generate an interview scenario from an inline Q&A set. */
export interface GenerateFromQnaRequest {
  name: string;
  description?: string;
  context_prompt?: string;
  questions: QnaQuestion[];
}

export interface GenerateScenarioResponse {
  uuid: string;
  job_uuid: string;
  batch_uuid?: string;
  batch_scenario_uuids?: string[];
  [key: string]: unknown;
}

export interface UpdateScenarioRequest {
  name?: string;
  description?: string;
}

export interface Scenario {
  uuid: string;
  name: string;
  scenario_type?: ScenarioType;
  status?: ScenarioStatus;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ListScenariosParams extends ListParams {
  scenario_type?: ScenarioType;
  // Open enum: known values are suggested, but the API may add statuses without
  // a version bump, so a pass-through filter must forward unknown values too.
  status?: ScenarioStatus | (string & {});
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface Job {
  uuid: string;
  job_type?: string;
  current_status: JobStatus;
  current_progress_text?: string;
  progress_percentage?: number;
  error_details?: string;
  task_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ListJobsParams extends ListParams {
  current_status?: JobStatus;
}

// ---------------------------------------------------------------------------
// Simulations & evaluation
// ---------------------------------------------------------------------------

export interface SimulateRequest {
  /** Provide exactly one of scenario_uuid / scenario_uuids. */
  scenario_uuid?: string;
  /** Up to 50 scenarios as a linked run group; mutually exclusive with scenario_uuid. */
  scenario_uuids?: string[];
  agent_uuid: string;
  evaluate_on_complete?: boolean;
  num_runs?: number;
  /** 1-240; overrides the scenario default for this run. */
  timeout_minutes?: number;
}

export interface SimulateResponse {
  job_uuid?: string;
  simulation_uuid: string;
  simulation_uuids?: string[];
  run_group_uuid?: string;
  evaluation_job_uuid?: string;
  status?: RunStatus;
  [key: string]: unknown;
}

export interface CreditPreviewRequest {
  mode: 'scenario_run' | 'scenario_generation';
  /** Required for `scenario_run`; omit for `scenario_generation`. */
  scenario_uuid?: string;
  num_runs?: number;
  timeout_minutes?: number;
  agent_uuid?: string;
  /** Required for `scenario_generation` — number of scenario creates to price. */
  num_scenarios?: number;
}

export interface CreditPreviewGenerationItem {
  jobUuid: string;
  estimatedCredits: number;
  status?: string | null;
}

export interface CreditPreview {
  balance?: number;
  newRunEstimatedCredits?: number | null;
  newRunEstimateMetadata?: Record<string, unknown> | null;
  newGenerationEstimatedCredits?: number | null;
  existingRuns?: unknown[];
  existingRunsEstimatedTotal?: number;
  existingGenerations?: CreditPreviewGenerationItem[];
  pendingGenerationsEstimatedTotal?: number;
  pendingCommittedTotal?: number;
  [key: string]: unknown;
}

export interface EvaluationJobRef {
  uuid: string;
  current_status?: string;
  [key: string]: unknown;
}

export interface SimulationRun {
  uuid: string;
  status: RunStatus;
  scenario_uuid?: string;
  agent_uuid?: string;
  evaluation_job_uuid?: string;
  /** Evaluation jobs queued for this run; take the last entry's uuid. */
  evaluation_jobs?: EvaluationJobRef[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ListRunsParams extends ListParams {
  // Open enum (see ListScenariosParams.status) — forward unknown statuses.
  status?: RunStatus | (string & {});
  agent_uuid?: string;
  scenario_uuid?: string;
  run_group_uuid?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

/**
 * Response from triggering an evaluation. `job_uuid` isn't in the spec schema
 * but some engine paths return it as a fallback for `evaluation_job_uuid`.
 */
export type TriggerEvaluationResponse = Schemas['TriggerEvaluationResponse'] & {
  job_uuid?: string;
};

/** A completed evaluation job (scores, verdicts, and progress metadata). */
export type Evaluation = Schemas['GetEvaluationResponse'];

/**
 * Scores payload from the evaluation/scores shortcut. The API returns this
 * wrapped in a `PublicSimulationScoreResponse` (`{ success, data }`) envelope;
 * the SDK resource methods unwrap it. The batch `getScores` map values share
 * this type.
 */
export type EvaluationScores = Schemas['PublicSimulationScoreSummary'];

/** Wire envelope for `GET /simulations/{id}/evaluation/scores`. */
export type SimulationScoreEnvelope = Schemas['PublicSimulationScoreResponse'];

/** Wire envelope for `GET /simulations/scores` (batch). */
export type BatchSimulationScoresEnvelope = Schemas['PublicBatchSimulationScoresResponse'];

/** Wire envelope for `GET /simulations/{id}/evaluation`. */
export type SimulationEvaluationEnvelope = Schemas['PublicSimulationEvaluationResponse'];

/**
 * Parsed ScenarioOutput / response.json for a completed run. The spec types the
 * body as a free-form object, so this stays an open bag.
 */
export interface RunOutput {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Tags (served from the authed /api/v1 base, returned as a bare JSON array)
// ---------------------------------------------------------------------------

export interface Tag {
  name: string;
  category?: string;
  description?: string;
  /** Benchmark family id: a string, an array of strings, or null for normal tags. */
  benchmark_family?: string | string[] | null;
  allowed_scenario_types?: ScenarioType[];
  /** True when the tag comes from your org's custom overlay. */
  custom?: boolean;
  [key: string]: unknown;
}

/** Register an org-specific QnA (interview) benchmark tag. */
export interface RegisterQnaTagRequest {
  skill_tag: string;
  description?: string;
  testing_method?: string;
  qna: { questions: QnaQuestion[] };
  dry_run?: boolean;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface ListUsageEventsParams extends ListParams {
  product_area?: string;
  simulation_uuid?: string;
  job_uuid?: string;
  scenario_uuid?: string;
  simulation_job_uuid?: string;
  evaluation_job_uuid?: string;
  failed?: boolean;
  event_start_from?: string;
  event_start_to?: string;
}

/**
 * A billing/usage event. Per-event spend is sourced from `actual_total_event_cost`
 * (LLM + compute USD actuals); see `get_usage_summary` for aggregation.
 */
export type UsageEvent = Schemas['UsageEventResponse'];

/** Organization credit balance for the API key's org. */
export type BillingBalance = Schemas['PublicBillingBalanceResponse'];

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export interface ListLogsParams extends ListParams {
  /** ISO 8601 start — required together with `to`. */
  from: string;
  /** ISO 8601 end — required together with `from`. */
  to: string;
  actor?: string;
  action?: string;
}

export type LogEntry = Schemas['PublicAuditLogEntry'];

export interface ListUsageCallsParams extends ListParams {
  event_uuid?: string;
  provider_name?: string;
  model_name?: string;
  call_start_from?: string;
  call_start_to?: string;
}

export type UsageCall = Schemas['UsageCallResponse'];
