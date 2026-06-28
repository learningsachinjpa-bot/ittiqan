import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agents as agentsApi, approvalGateway } from '../../lib/api'
import type { Agent } from '../../types'

type Lang = 'python' | 'node' | 'curl'

const TAB: { id: Lang; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'node',   label: 'Node.js' },
  { id: 'curl',   label: 'cURL' },
]

function Code({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="relative rounded-xl bg-gray-900 overflow-hidden">
      <button
        onClick={copy}
        className="absolute top-3 right-3 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded transition-colors"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre className="text-sm text-gray-200 p-5 pr-16 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function InlineCopy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-sm text-gray-800">
      <span className="flex-1 truncate">{value}</span>
      <button onClick={copy} className="text-xs text-gray-400 hover:text-cyan-600 flex-shrink-0">
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  )
}

function snippets(agentId: string, apiBase: string, apiKey: string): Record<Lang, string> {
  return {
    python: `import httpx

ITTIQAN_BASE = "${apiBase}"
AGENT_ID     = "${agentId}"
API_KEY      = "${apiKey || '<YOUR_ORG_API_KEY>'}"

def log_trace(input_text: str, output_text: str,
              latency_ms: int, model: str = "gpt-4o"):
    """Send a trace to Ittiqan after every agent call."""
    httpx.post(
        f"{ITTIQAN_BASE}/observability/traces",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "agent_id": AGENT_ID,
            "input":       input_text,
            "output":      output_text,
            "latency_ms":  latency_ms,
            "model_used":  model,
            "tokens_input":  0,   # optional
            "tokens_output": 0,   # optional
        },
        timeout=5,
    )

# ── Approval Gateway (Enterprise) ────────────────────────────────
def request_approval(action_title: str, payload: dict,
                     urgency: str = "normal",
                     callback_url: str | None = None) -> str:
    """Submit an action for human approval. Returns the request id."""
    r = httpx.post(
        f"{ITTIQAN_BASE}/approvals/request",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "agent_id":          AGENT_ID,
            "action_type":       "custom_action",
            "action_title":      action_title,
            "action_payload":    payload,
            "urgency":           urgency,
            "callback_url":      callback_url,
            "expires_minutes":   30,
        },
        timeout=5,
    )
    return r.json()["id"]

def poll_approval(request_id: str) -> str:
    """Returns 'pending' | 'approved' | 'rejected' | 'expired'."""
    r = httpx.get(
        f"{ITTIQAN_BASE}/approvals/request/{request_id}/status",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=5,
    )
    return r.json()["status"]`,

    node: `import fetch from 'node-fetch'  // or use built-in fetch in Node 18+

const ITTIQAN_BASE = '${apiBase}'
const AGENT_ID     = '${agentId}'
const API_KEY      = '${apiKey || '<YOUR_ORG_API_KEY>'}'

/** Send a trace to Ittiqan after every agent call. */
async function logTrace({ input, output, latencyMs, model = 'gpt-4o' }) {
  await fetch(\`\${ITTIQAN_BASE}/observability/traces\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id:   AGENT_ID,
      input,
      output,
      latency_ms: latencyMs,
      model_used: model,
    }),
  })
}

// ── Approval Gateway (Enterprise) ────────────────────────────────
/** Submit an action for human approval. Returns the request id. */
async function requestApproval({ actionTitle, payload, urgency = 'normal' }) {
  const res = await fetch(\`\${ITTIQAN_BASE}/approvals/request\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id:     AGENT_ID,
      action_type:  'custom_action',
      action_title: actionTitle,
      action_payload: payload,
      urgency,
      expires_minutes: 30,
    }),
  })
  const { id } = await res.json()
  return id
}`,

    curl: `# ── Log a trace ──────────────────────────────────────────────────
curl -X POST ${apiBase}/observability/traces \\
  -H "Authorization: Bearer ${apiKey || '<YOUR_ORG_API_KEY>'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id":   "${agentId}",
    "input":      "What is the capital of France?",
    "output":     "Paris.",
    "latency_ms": 342,
    "model_used": "gpt-4o"
  }'

# ── Submit an approval request (Enterprise) ───────────────────────
curl -X POST ${apiBase}/approvals/request \\
  -H "Authorization: Bearer ${apiKey || '<YOUR_ORG_API_KEY>'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id":      "${agentId}",
    "action_type":   "send_email",
    "action_title":  "Send weekly report to CEO",
    "action_payload": {"to": "ceo@company.com"},
    "urgency":       "high",
    "expires_minutes": 60
  }'

# ── Poll approval status ──────────────────────────────────────────
curl ${apiBase}/approvals/request/<REQUEST_ID>/status \\
  -H "Authorization: Bearer ${apiKey || '<YOUR_ORG_API_KEY>'}"`,
  }
}

export default function QuickStartPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [lang, setLang] = useState<Lang>('python')
  const [apiKey, setApiKey] = useState('')
  const [generatingKey, setGeneratingKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1'

  useEffect(() => {
    if (!agentId) return
    Promise.all([
      agentsApi.get(agentId).then(setAgent),
      approvalGateway.apiKeyInfo().then(info => {
        if (!info.has_key) return
        setApiKey('••••••••  (rotate to get a new visible key)')
      }),
    ])
      .catch(e => setFetchError(e instanceof Error ? e.message : 'Failed to load agent'))
      .finally(() => setLoading(false))
  }, [agentId])

  async function generateKey() {
    setGeneratingKey(true)
    try {
      const res = await approvalGateway.generateApiKey()
      setApiKey(res.api_key)
    } finally {
      setGeneratingKey(false)
    }
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center text-gray-400">Loading…</div>
  )

  if (fetchError) return (
    <div className="p-8 max-w-lg mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">{fetchError}</div>
      <button onClick={() => navigate('/dashboard/agents')} className="mt-4 text-sm text-gray-500 hover:text-gray-700">← Back to Agents</button>
    </div>
  )

  const code = snippets(agentId ?? '', apiBase, apiKey.startsWith('itq_') ? apiKey : '')

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">

      {/* Hero */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-cyan-100 text-sm font-medium mb-1">Agent connected ✓</p>
            <h1 className="text-2xl font-bold">{agent?.name ?? 'Your Agent'}</h1>
            <p className="text-cyan-100 text-sm mt-1">Follow the steps below to start sending traces and triggering evaluations.</p>
          </div>
          <button
            onClick={() => navigate(`/project/${agentId}`)}
            className="text-sm text-cyan-100 hover:text-white border border-cyan-400 hover:border-white px-4 py-2 rounded-lg transition-colors"
          >
            Go to Dashboard →
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-6">

        {/* Step 1 — IDs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-cyan-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">1</span>
            <h2 className="font-semibold text-gray-900">Copy your Agent ID</h2>
          </div>
          <p className="text-sm text-gray-500 ml-10">Every trace and approval request must include your <code className="bg-gray-100 px-1 rounded text-xs">agent_id</code>.</p>
          <div className="ml-10">
            <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">Agent ID</p>
            <InlineCopy value={agentId ?? ''} />
          </div>
        </div>

        {/* Step 2 — API key */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-cyan-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">2</span>
            <h2 className="font-semibold text-gray-900">Get your Org API Key</h2>
          </div>
          <p className="text-sm text-gray-500 ml-10">
            Used as the <code className="bg-gray-100 px-1 rounded text-xs">Bearer</code> token for all agent-to-Ittiqan calls. Keep it secret — treat it like a password.
          </p>
          <div className="ml-10 space-y-3">
            {apiKey && apiKey.startsWith('itq_') ? (
              <>
                <div>
                  <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">API Key — copy now, won't be shown again</p>
                  <InlineCopy value={apiKey} />
                </div>
                <p className="text-xs text-amber-600">⚠ Store this securely (e.g. as an environment variable <code>ITTIQAN_API_KEY</code>). It won't be shown again.</p>
              </>
            ) : (
              <button
                onClick={generateKey}
                disabled={generatingKey}
                className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {generatingKey ? 'Generating…' : 'Generate API Key'}
              </button>
            )}
          </div>
        </div>

        {/* Step 3 — Code */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-cyan-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">3</span>
            <h2 className="font-semibold text-gray-900">Send your first trace</h2>
          </div>
          <p className="text-sm text-gray-500 ml-10">
            Call <code className="bg-gray-100 px-1 rounded text-xs">POST /api/v1/observability/traces</code> after every agent invocation. Ittiqan uses these to compute metrics, trigger alerts, and generate evaluation datasets.
          </p>
          <div className="ml-10 space-y-3">
            <div className="flex gap-1">
              {TAB.map(t => (
                <button
                  key={t.id}
                  onClick={() => setLang(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${lang === t.id ? 'bg-cyan-500 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Code code={code[lang]} />
          </div>
        </div>

        {/* Step 4 — Verify */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-cyan-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">4</span>
            <h2 className="font-semibold text-gray-900">Verify traces are arriving</h2>
          </div>
          <p className="text-sm text-gray-500 ml-10">
            After sending a trace, open your agent dashboard and check <strong>Observability → Traces</strong>. You should see it within seconds.
          </p>
          <div className="ml-10">
            <button
              onClick={() => navigate(`/project/${agentId}/observability/traces`)}
              className="text-sm text-cyan-600 font-medium hover:underline"
            >
              Open Observability → Traces →
            </button>
          </div>
        </div>

        {/* Step 5 — Run eval */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-gray-200 text-gray-500 text-sm font-bold flex items-center justify-center flex-shrink-0">5</span>
            <h2 className="font-semibold text-gray-900">Run your first evaluation</h2>
          </div>
          <p className="text-sm text-gray-500 ml-10">
            Upload a dataset and run an evaluation to get quality scores, failure taxonomy, and recommendations.
          </p>
          <div className="ml-10 flex gap-3">
            <button
              onClick={() => navigate(`/project/${agentId}/datasets`)}
              className="text-sm text-cyan-600 font-medium hover:underline"
            >
              Upload a Dataset →
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => navigate(`/project/${agentId}/evaluations`)}
              className="text-sm text-cyan-600 font-medium hover:underline"
            >
              Run Evaluation →
            </button>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => navigate('/dashboard/agents')} className="text-sm text-gray-400 hover:text-gray-600">
          ← Back to Agents
        </button>
        <button
          onClick={() => navigate(`/project/${agentId}`)}
          className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
        >
          Open Agent Dashboard →
        </button>
      </div>
    </div>
  )
}
