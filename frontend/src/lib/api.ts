import type {
  User, Organization, Agent, Dataset, TestCase,
  Evaluation, EvaluationResult, LLMProvider, SecurityAssessment, MetricInfo,
} from '../types'

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1'

function getToken() {
  return localStorage.getItem('ittiqan_access_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, options)
    localStorage.removeItem('ittiqan_access_token')
    localStorage.removeItem('ittiqan_refresh_token')
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error((err as { detail?: string }).detail || 'Request failed')
  }

  return res.json() as Promise<T>
}

export function getWsUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws') + '/api/v1'
  const token = getToken()
  return `${base}${path}?token=${encodeURIComponent(token || '')}`
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem('ittiqan_refresh_token')
  if (!refresh) return false
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) return false
    const data = await res.json() as { access_token: string; refresh_token?: string }
    localStorage.setItem('ittiqan_access_token', data.access_token)
    if (data.refresh_token) localStorage.setItem('ittiqan_refresh_token', data.refresh_token)
    return true
  } catch {
    return false
  }
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem('ittiqan_access_token', access)
  localStorage.setItem('ittiqan_refresh_token', refresh)
}

function clearTokens() {
  localStorage.removeItem('ittiqan_access_token')
  localStorage.removeItem('ittiqan_refresh_token')
}

// ── Auth ──────────────────────────────────────────────────────────────────────

interface TokenResponse { access_token: string; refresh_token: string; user: User }

export const auth = {
  signup: async (name: string, email: string, password: string): Promise<User> => {
    const data = await request<TokenResponse>('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) })
    setTokens(data.access_token, data.refresh_token)
    return data.user
  },
  login: async (email: string, password: string): Promise<User> => {
    const data = await request<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    setTokens(data.access_token, data.refresh_token)
    return data.user
  },
  googleAuth: async (accessToken: string): Promise<User> => {
    const data = await request<TokenResponse>('/auth/google', { method: 'POST', body: JSON.stringify({ access_token: accessToken }) })
    setTokens(data.access_token, data.refresh_token)
    return data.user
  },
  me: () => request<User>('/auth/me'),
  logout: clearTokens,
}

// ── Organizations ─────────────────────────────────────────────────────────────

interface CreateOrgBody {
  name: string; slug?: string; plan: string; region?: string
  department?: string; use_case?: string
}

interface UpdateOrgBody { name?: string; department?: string; use_case?: string }

export interface OrgMember {
  id: string; user_id: string; name: string; email: string
  picture?: string; role: string; joined_at: string
}

export const orgs = {
  create: (body: CreateOrgBody) =>
    request<Organization>('/organizations', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request<Organization>('/organizations/me'),
  update: (body: UpdateOrgBody) =>
    request<Organization>('/organizations/me', { method: 'PUT', body: JSON.stringify(body) }),
  members: () => request<OrgMember[]>('/organizations/me/members'),
  invite: (email: string, role: string) =>
    request<OrgMember>('/organizations/me/invite', { method: 'POST', body: JSON.stringify({ email, role }) }),
  auditLogs: (limit = 50) =>
    request<{ id: string; action: string; resource_type: string; ip_address: string; created_at: string }[]>(
      `/organizations/me/audit-logs?limit=${limit}`
    ),
}

// ── Agents ────────────────────────────────────────────────────────────────────

interface CreateAgentBody {
  name: string; description?: string; endpoint_url?: string
  http_method?: string; headers?: Record<string, string>
  payload_template?: string; response_path?: string
  api_key?: string; tags?: string[]
  enable_multi_turn?: boolean; enable_trace_metrics?: boolean
  metrics_config?: Record<string, unknown>
  default_metrics?: string[]
  llm_judge_provider?: string; llm_judge_model?: string
  llm_judge_provider_id?: string
}

export const agents = {
  list: () => request<Agent[]>('/agents'),
  get: (id: string) => request<Agent>(`/agents/${id}`),
  create: (body: CreateAgentBody) => request<Agent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<CreateAgentBody>) => request<Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ success: boolean }>(`/agents/${id}`, { method: 'DELETE' }),
  testConnection: (id: string, testInput?: string) =>
    request<{ success: boolean; response?: string; latency_ms?: number; error?: string }>(
      `/agents/${id}/test-connection`, { method: 'POST', body: JSON.stringify({ test_input: testInput }) }
    ),
}

// ── Datasets ──────────────────────────────────────────────────────────────────

interface AddTestCaseBody {
  input: string; expected_output?: string
  context?: Record<string, unknown>; retrieval_context?: string[]
}

export const datasets = {
  list: () => request<Dataset[]>('/datasets'),
  get: (id: string) => request<Dataset>(`/datasets/${id}`),
  delete: (id: string) => request<{ success: boolean }>(`/datasets/${id}`, { method: 'DELETE' }),
  testCases: (id: string, limit = 100, offset = 0) =>
    request<TestCase[]>(`/datasets/${id}/test-cases?limit=${limit}&offset=${offset}`),
  addTestCases: (id: string, cases: AddTestCaseBody[]) =>
    request<Dataset>(`/datasets/${id}/test-cases`, { method: 'POST', body: JSON.stringify(cases) }),
  deleteTestCase: (datasetId: string, caseId: string) =>
    request<Dataset>(`/datasets/${datasetId}/test-cases/${caseId}`, { method: 'DELETE' }),
  upload: async (file: File, name: string, description?: string): Promise<Dataset> => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    if (description) form.append('description', description)
    const token = getToken()
    const res = await fetch(`${BASE}/datasets/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' })) as { detail?: string }
      throw new Error(err.detail || 'Upload failed')
    }
    return res.json() as Promise<Dataset>
  },
}

// ── Evaluations ───────────────────────────────────────────────────────────────

interface RunEvaluationBody {
  agent_id: string; dataset_id: string; name: string
  metrics: string[]; llm_judge_provider_id?: string
  metric_thresholds?: Record<string, number>
}

interface MetricsResponse {
  metrics: string[]
  registry: Record<string, MetricInfo>
}

export const evaluations = {
  list: (agentId?: string) =>
    request<Evaluation[]>(`/evaluations${agentId ? `?agent_id=${agentId}` : ''}`),
  get: (id: string) => request<Evaluation>(`/evaluations/${id}`),
  run: (body: RunEvaluationBody) =>
    request<Evaluation>('/evaluations', { method: 'POST', body: JSON.stringify(body) }),
  results: (id: string, limit = 100) =>
    request<EvaluationResult[]>(`/evaluations/${id}/results?limit=${limit}`),
  metrics: () => request<MetricsResponse>('/evaluations/metrics'),
}

// ── Security ──────────────────────────────────────────────────────────────────

interface CreateAssessmentBody {
  agent_id: string; name: string; framework: string
  attack_categories?: string[]; num_attacks_per_category?: number
  llm_attacker_provider_id?: string; llm_judge_provider_id?: string
}

export const security = {
  frameworks: () => request<Record<string, { name: string; categories: string[] }>>('/security/frameworks'),
  list: (agentId?: string) =>
    request<SecurityAssessment[]>(`/security${agentId ? `?agent_id=${agentId}` : ''}`),
  get: (id: string) => request<SecurityAssessment>(`/security/${id}`),
  create: (body: CreateAssessmentBody) =>
    request<SecurityAssessment>('/security', { method: 'POST', body: JSON.stringify(body) }),
  findings: (id: string, isVulnerable?: boolean) =>
    request<{ id: string; attack_type: string; prompt: string; response: string; is_vulnerable: boolean; severity: string }[]>(
      `/security/${id}/findings${isVulnerable !== undefined ? `?is_vulnerable=${isVulnerable}` : ''}`
    ),
}

// ── LLM Providers ─────────────────────────────────────────────────────────────

interface CreateProviderBody {
  name: string; provider_type: string; model_name: string
  api_key?: string; base_url?: string
  is_default_judge?: boolean; is_default_attacker?: boolean
}

export const llmProviders = {
  list: () => request<LLMProvider[]>('/llm-providers'),
  create: (body: CreateProviderBody) =>
    request<LLMProvider>('/llm-providers', { method: 'POST', body: JSON.stringify(body) }),
  test: (id: string) =>
    request<{ success: boolean; response?: string; error?: string }>(`/llm-providers/${id}/test`, { method: 'POST' }),
  update: (id: string, body: Partial<CreateProviderBody>) =>
    request<LLMProvider>(`/llm-providers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/llm-providers/${id}`, { method: 'DELETE' }),
  supportedModels: () =>
    request<Record<string, string[]>>('/llm-providers/models'),
}

// ── Observability ─────────────────────────────────────────────────────────────

interface TraceBody {
  agent_id: string; session_id?: string; input: string; output: string
  latency_ms?: number; tokens_used?: number; cost_usd?: number
  metadata?: Record<string, unknown>
}

interface AlertBody {
  name: string; metric: string; operator: '<' | '>'
  threshold: number; agent_id?: string
}

export const observability = {
  traces: (agentId?: string, hours = 24) =>
    request<{ id: string; input: string; output: string; latency_ms: number; created_at: string }[]>(
      `/observability/traces?hours=${hours}${agentId ? `&agent_id=${agentId}` : ''}`
    ),
  trace: (traceId: string) =>
    request<{ id: string; input: string; output: string; spans: unknown[] }>(`/observability/traces/${traceId}`),
  metrics: (agentId?: string, hours = 24) =>
    request<{ avg_latency_ms: number; total_traces: number; error_rate: number }>(
      `/observability/metrics?hours=${hours}${agentId ? `&agent_id=${agentId}` : ''}`
    ),
  ingestTrace: (body: TraceBody) =>
    request<{ id: string }>('/observability/traces', { method: 'POST', body: JSON.stringify(body) }),
  alerts: () =>
    request<{ id: string; name: string; metric: string; threshold: number; is_active: boolean }[]>('/observability/alerts'),
  createAlert: (body: AlertBody) =>
    request<{ id: string }>('/observability/alerts', { method: 'POST', body: JSON.stringify(body) }),
  deleteAlert: (id: string) =>
    request<{ success: boolean }>(`/observability/alerts/${id}`, { method: 'DELETE' }),
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export interface Schedule {
  id: string; name: string; cron_expression: string
  agent_id?: string; dataset_id?: string; llm_judge_provider_id?: string
  status: 'active' | 'paused'
  created_at: string; last_run_at?: string
}

interface CreateScheduleBody {
  name: string; cron_expression: string
  agent_id?: string; dataset_id?: string; llm_judge_provider_id?: string
}

export const schedules = {
  list: () => request<Schedule[]>('/schedules'),
  create: (body: CreateScheduleBody) =>
    request<Schedule>('/schedules', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; cron_expression?: string; status?: string }) =>
    request<Schedule>(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/schedules/${id}`, { method: 'DELETE' }),
  pauseAll: () =>
    request<{ success: boolean }>('/schedules/pause-all', { method: 'POST' }),
}
