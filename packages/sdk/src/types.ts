// Shared request/response types for the VerifyAX REST API.
//
// Response interfaces document the fields the SDK relies on and carry an
// `[key: string]: unknown` index signature where the API returns more than the
// reference (docs/verifyax-api.md) pins down — forward-compatible without `any`.

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
  region?: string;
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
  agent_url: string;
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
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export interface GenerateScenarioRequest {
  name: string;
  description?: string;
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
  status?: ScenarioStatus;
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
  scenario_uuid: string;
  num_runs?: number;
  timeout_minutes?: number;
  agent_uuid?: string;
}

export interface CreditPreview {
  balance?: number;
  newRunEstimatedCredits?: number;
  existingRuns?: number;
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
  status?: RunStatus;
  agent_uuid?: string;
  scenario_uuid?: string;
}

export interface TriggerEvaluationResponse {
  evaluation_job_uuid?: string;
  job_uuid?: string;
  [key: string]: unknown;
}

export interface Evaluation {
  [key: string]: unknown;
}

/** Scores payload from the evaluation/scores shortcut. */
export interface EvaluationScores {
  overall_score?: number;
  per_tag_scores?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Parsed ScenarioOutput / response.json for a completed run. */
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

export interface UsageEvent {
  uuid?: string;
  event_uuid?: string;
  [key: string]: unknown;
}

/** Organization credit balance for the API key's org. */
export interface BillingBalance {
  credits_remaining?: number;
  credits_used?: number;
  plan?: string;
  billing_period_end?: string;
  [key: string]: unknown;
}

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

export interface LogEntry {
  [key: string]: unknown;
}

export interface ListUsageCallsParams extends ListParams {
  event_uuid?: string;
  provider_name?: string;
  model_name?: string;
  call_start_from?: string;
  call_start_to?: string;
}

export interface UsageCall {
  [key: string]: unknown;
}
