// ── Core domain types — mirrors backend Pydantic/SQLAlchemy models ────────────

export interface Organization {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro' | 'enterprise'
  region: 'uae' | 'eu' | 'us'
  department?: string
  use_case?: string
  max_agents: number
  max_evaluations_per_month: number
  max_datasets: number
  created_at: string
}

export interface User {
  id: string
  name: string
  email: string
  picture?: string
  is_verified: boolean
  org: Organization | null
}

export interface Agent {
  id: string
  org_id: string
  name: string
  description?: string
  tags: string[]
  status: 'active' | 'inactive' | 'degraded'
  endpoint_url: string
  http_method: 'GET' | 'POST' | 'PUT'
  headers: Record<string, string>
  payload_template?: string
  response_path?: string
  has_api_key: boolean
  enable_multi_turn: boolean
  enable_trace_metrics: boolean
  metrics_config: Record<string, unknown>
  default_metrics: string[]
  llm_judge_provider: string
  llm_judge_model: string
  llm_judge_provider_id?: string
  last_evaluated_at?: string
  created_at: string
}

export interface Dataset {
  id: string
  name: string
  description?: string
  file_format?: string
  row_count: number
  version: number
  columns: string[]
  sample_rows: Record<string, unknown>[]
  created_at: string
}

export interface TestCase {
  id: string
  input: string
  expected_output?: string
  context?: Record<string, unknown>
  retrieval_context?: string[]
}

export interface MetricResult {
  score: number
  passed: boolean
  reason?: string
  criteria_scores?: Record<string, number>
  failure_types?: string[]
  failure_attribution?: string
  confidence?: number
  cost_usd?: number
}

export interface EvaluationResult {
  id: string
  input: string
  actual_output?: string
  expected_output?: string
  metric_results: Record<string, MetricResult>
  overall_passed: boolean
  latency_ms?: number
  error?: string
  error_action?: string
}

export type EvaluationStatus = 'pending' | 'running' | 'judge_running' | 'completed' | 'failed' | 'cancelled'

export interface Evaluation {
  id: string
  name: string
  agent_id: string
  dataset_id: string
  status: EvaluationStatus
  metrics: string[]
  total_cases: number
  completed_cases: number
  overall_score?: number
  metric_scores: Record<string, number>
  passed_count?: number
  failed_count?: number
  error_message?: string
  error_action?: string
  judge_prompt_version?: number
  dataset_version?: number
  created_at: string
  started_at?: string
  completed_at?: string
}

export type ProviderType =
  | 'anthropic' | 'openai' | 'gemini' | 'mistral' | 'groq'
  | 'ollama' | 'azure_openai' | 'bedrock' | 'vertex_ai'
  | 'together' | 'perplexity' | 'xai' | 'cerebras' | 'cohere' | 'custom'

export interface LLMProvider {
  id: string
  name: string
  provider_type: ProviderType
  model_name: string
  base_url?: string
  has_api_key: boolean
  is_default_judge: boolean
  is_default_attacker: boolean
  is_active: boolean
  total_calls: number
  total_tokens_used: number
  total_cost_usd: number
}

export interface MetricInfo {
  id: string
  name: string
  category: string
  description: string
  default_threshold: number
  requires_context: boolean
  requires_expected: boolean
}

export type SecurityAssessmentStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface SecurityAssessment {
  id: string
  name: string
  agent_id: string
  status: SecurityAssessmentStatus
  attack_types: string[]
  total_attacks: number
  completed_attacks: number
  passed_attacks?: number
  failed_attacks?: number
  overall_risk_score?: number
  vulnerability_summary?: Record<string, unknown>
  error_message?: string
  error_action?: string
  created_at: string
  completed_at?: string
  risk_score?: number
  vulnerable_count?: number
  framework?: string
}
