import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { agents } from '../../lib/api'

interface Metric { name: string; source: string; threshold: number; enabled: boolean }

const DEFAULT_METRICS: Metric[] = [
  { name: 'Knowledge Retention', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Role Adherence', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Turn Relevancy', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Conversation Completeness', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Goal Accuracy', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Tool Use', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Topic Adherence', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Turn Faithfulness', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Turn Contextual Precision', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Turn Contextual Recall', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Turn Contextual Relevancy', source: 'MULTI-TURN CONVERSATION', threshold: 0.70, enabled: true },
  { name: 'Faithfulness', source: 'RAG', threshold: 0.70, enabled: true },
  { name: 'Answer Relevancy', source: 'RAG', threshold: 0.70, enabled: true },
  { name: 'Contextual Precision', source: 'RAG', threshold: 0.70, enabled: true },
  { name: 'Contextual Recall', source: 'RAG', threshold: 0.70, enabled: true },
  { name: 'Contextual Relevancy', source: 'RAG', threshold: 0.70, enabled: true },
  { name: 'Hallucination Rate', source: 'RAG', threshold: 0.30, enabled: true },
  { name: 'JSON Correctness', source: 'RAG', threshold: 0.70, enabled: true },
  { name: 'Summarization Quality', source: 'RAG', threshold: 0.70, enabled: true },
  { name: 'Bias Detection', source: 'SAFETY/SECURITY', threshold: 0.80, enabled: true },
  { name: 'Toxicity Scoring', source: 'SAFETY/SECURITY', threshold: 0.80, enabled: true },
  { name: 'PII Leakage Prevention', source: 'SAFETY/SECURITY', threshold: 0.80, enabled: true },
  { name: 'Role Violation Check', source: 'SAFETY/SECURITY', threshold: 0.80, enabled: true },
  { name: 'Misuse Detection', source: 'SAFETY/SECURITY', threshold: 0.80, enabled: true },
  { name: 'Non-Advice Guardrail', source: 'SAFETY/SECURITY', threshold: 0.80, enabled: true },
  { name: 'Prompt Injection Detection', source: 'SAFETY/SECURITY', threshold: 0.80, enabled: true },
  { name: 'Tool Correctness', source: 'AGENTIC/TOOL USE', threshold: 0.70, enabled: true },
  { name: 'Argument Correctness', source: 'AGENTIC/TOOL USE', threshold: 0.70, enabled: true },
  { name: 'Step Efficiency', source: 'AGENTIC/TOOL USE', threshold: 0.70, enabled: true },
  { name: 'Plan Adherence', source: 'AGENTIC/TOOL USE', threshold: 0.70, enabled: true },
  { name: 'Plan Quality', source: 'AGENTIC/TOOL USE', threshold: 0.70, enabled: true },
]

const sourceColors: Record<string, string> = {
  'MULTI-TURN CONVERSATION': 'bg-blue-100 text-blue-700',
  'RAG': 'bg-purple-100 text-purple-700',
  'SAFETY/SECURITY': 'bg-red-100 text-red-700',
  'AGENTIC/TOOL USE': 'bg-green-100 text-green-700',
  'ENTERPRISE COMPLIANCE': 'bg-orange-100 text-orange-700',
}

function mergeWithSaved(saved: Record<string, { threshold?: number; enabled?: boolean }>): Metric[] {
  return DEFAULT_METRICS.map(m => {
    const s = saved[m.name]
    if (!s) return m
    return { ...m, threshold: s.threshold ?? m.threshold, enabled: s.enabled ?? m.enabled }
  })
}

export default function MetricsConfigPage() {
  const { id: agentId } = useParams<{ id: string }>()
  const [metrics, setMetrics] = useState<Metric[]>(DEFAULT_METRICS)
  const [draft, setDraft] = useState<Metric[]>(DEFAULT_METRICS)
  const [filter, setFilter] = useState('')
  const [source, setSource] = useState('All Sources')
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!agentId) return
    agents.get(agentId).then(agent => {
      const saved = (agent.metrics_config as Record<string, { threshold?: number; enabled?: boolean }>) || {}
      const merged = mergeWithSaved(saved)
      setMetrics(merged)
      setDraft(merged)
    }).catch(e => setLoadError((e as Error).message))
  }, [agentId])

  const filtered = (editMode ? draft : metrics).filter(m =>
    m.name.toLowerCase().includes(filter.toLowerCase()) &&
    (source === 'All Sources' || m.source === source.toUpperCase())
  )

  function updateDraft(name: string, field: 'threshold' | 'enabled', value: number | boolean) {
    setDraft(prev => prev.map(m => m.name === name ? { ...m, [field]: value } : m))
  }

  async function handleSave() {
    if (!agentId) return
    setSaving(true)
    setSaveError('')
    try {
      const config: Record<string, { threshold: number; enabled: boolean }> = {}
      for (const m of draft) config[m.name] = { threshold: m.threshold, enabled: m.enabled }
      await agents.update(agentId, { metrics_config: config })
      setMetrics(draft)
      setEditMode(false)
    } catch (e) {
      setSaveError((e as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDraft(metrics)
    setEditMode(false)
    setSaveError('')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Metrics Configuration</h1>
          <p className="text-gray-500 text-sm">Manage thresholds and toggle evaluation metrics for your LLM deployments.</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button onClick={handleCancel} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-600 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              ✏ Edit Mode
            </button>
          )}
        </div>
      </div>

      {loadError && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{loadError}</div>}
      {saveError && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{saveError}</div>}

      <div className="flex gap-3 mb-4">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter metrics..." className="border border-gray-300 rounded-lg px-4 py-2 text-sm w-64 focus:outline-none focus:border-cyan-400" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">SOURCE:</span>
          <select value={source} onChange={e => setSource(e.target.value)} className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option>All Sources</option>
            <option>Multi-Turn Conversation</option>
            <option>RAG</option>
            <option>Safety/Security</option>
            <option>Agentic/Tool Use</option>
            <option>Enterprise Compliance</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <span className="col-span-4">Metric Name</span>
          <span className="col-span-4">Source</span>
          <span className="col-span-2 text-center">Threshold (0.0–1.0)</span>
          <span className="col-span-2 text-center">Enabled</span>
        </div>
        {filtered.map((m, i) => (
          <div key={m.name} className={`grid grid-cols-12 gap-2 px-5 py-3 items-center border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
            <span className="col-span-4 text-sm font-medium text-gray-900">{m.name}</span>
            <span className="col-span-4">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${sourceColors[m.source] || 'bg-gray-100 text-gray-600'}`}>{m.source}</span>
            </span>
            <div className="col-span-2 flex items-center justify-center gap-2">
              {editMode ? (
                <input
                  type="number" min="0" max="1" step="0.05"
                  value={m.threshold}
                  onChange={e => updateDraft(m.name, 'threshold', parseFloat(e.target.value) || 0)}
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-cyan-400"
                />
              ) : (
                <>
                  <div className="w-1 h-6 bg-orange-400 rounded" />
                  <span className="text-sm font-medium text-gray-700">{m.threshold.toFixed(2)}</span>
                </>
              )}
            </div>
            <div className="col-span-2 flex justify-center">
              {editMode ? (
                <button
                  onClick={() => updateDraft(m.name, 'enabled', !m.enabled)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${m.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                >
                  {m.enabled ? 'Active' : 'Inactive'}
                </button>
              ) : (
                <span className={`text-xs font-semibold ${m.enabled ? 'text-green-600' : 'text-gray-400'}`}>{m.enabled ? 'Active' : 'Inactive'}</span>
              )}
            </div>
          </div>
        ))}
        <div className="px-5 py-3 bg-gray-50 text-xs text-gray-400">Showing {filtered.length} metrics</div>
      </div>
    </div>
  )
}
