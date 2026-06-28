import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { observability } from '../../lib/api'
import type { ObsAlert } from '../../lib/api'

const SEV_COLOR: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const COND_LABELS: Record<string, string> = {
  error_rate: 'Error Rate >',
  latency_spike: 'Avg Latency >',
  score_drop: 'Score <',
}

const COND_UNITS: Record<string, string> = {
  error_rate: '%',
  latency_spike: 'ms',
  score_drop: '',
}

const COND_HINTS: Record<string, string> = {
  error_rate: 'Fires when error + timeout % exceeds this value over the last 30 min',
  latency_spike: 'Fires when average latency_ms exceeds this value over the last 30 min',
  score_drop: 'Coming soon — will fire when eval score drops below this value',
}

interface FiredResult {
  alert_id: string; alert_name: string; condition_type: string
  threshold: number; metric_value: number
}

export default function ObservabilityAlertsPage() {
  const { id: agentId } = useParams()
  const [alerts, setAlerts] = useState<ObsAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [condType, setCondType] = useState('error_rate')
  const [threshold, setThreshold] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [evalResult, setEvalResult] = useState<{ fired: FiredResult[]; fired_count: number } | null>(null)
  const [fetchError, setFetchError] = useState('')

  function load() {
    setLoading(true)
    setFetchError('')
    observability.alerts()
      .then(setAlerts)
      .catch(err => setFetchError(err instanceof Error ? err.message : 'Failed to load alerts'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !threshold) return
    setSubmitting(true)
    setFormError('')
    try {
      await observability.createAlert({
        name: name.trim(),
        condition_type: condType,
        condition_threshold: Number(threshold),
        severity,
        agent_id: agentId,
      })
      setShowForm(false)
      setName('')
      setThreshold('')
      load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create alert')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this alert?')) return
    await observability.deleteAlert(id)
    load()
  }

  async function handleEvaluate() {
    setEvaluating(true)
    setEvalResult(null)
    try {
      const result = await observability.evaluateAlerts(agentId)
      setEvalResult(result)
      if (result.fired_count > 0) load() // refresh triggered_count
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Evaluation failed')
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Fires when trace metrics breach a threshold — checked every 5 min</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEvaluate}
            disabled={evaluating}
            className="border border-cyan-300 text-cyan-700 hover:bg-cyan-50 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {evaluating
              ? <><span className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />Evaluating…</>
              : '▷ Run Evaluation Now'}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setFormError('') }}
            className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New Alert
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{fetchError}</div>
      )}

      {/* Evaluation result banner */}
      {evalResult !== null && (
        <div className={`rounded-xl border p-4 ${evalResult.fired_count > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          {evalResult.fired_count === 0 ? (
            <p className="text-sm font-medium text-green-700">All clear — no thresholds breached in the last 30 minutes</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-red-700 mb-2">{evalResult.fired_count} alert{evalResult.fired_count > 1 ? 's' : ''} fired — incidents created</p>
              <div className="space-y-1">
                {evalResult.fired.map(f => (
                  <div key={f.alert_id} className="text-xs text-red-600 flex gap-2">
                    <span className="font-medium">{f.alert_name}</span>
                    <span>—</span>
                    <span>{COND_LABELS[f.condition_type] ?? f.condition_type} {f.threshold}{COND_UNITS[f.condition_type] ?? ''} · current: {f.metric_value.toFixed(1)}{COND_UNITS[f.condition_type] ?? ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* How it works info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">How alerts work</p>
        <p>The engine evaluates all active alerts every 5 minutes automatically (after health checks). It looks at the last 30 minutes of trace data for this agent. When a threshold is breached, an Incident is created in Reliability → Incidents and any webhook channels are notified. Alerts have a 30-minute cooldown to prevent flooding.</p>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Create Alert</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Alert Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. High Error Rate"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                <select
                  value={condType}
                  onChange={e => setCondType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {Object.entries(COND_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l.replace(' >', '').replace(' <', '')}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{COND_HINTS[condType]}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Threshold {COND_UNITS[condType] ? `(${COND_UNITS[condType]})` : ''}
                </label>
                <input
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                  placeholder={condType === 'error_rate' ? 'e.g. 5' : condType === 'latency_spike' ? 'e.g. 2000' : '0.7'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={e => setSeverity(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {['low', 'medium', 'high', 'critical'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !name.trim() || !threshold}
                className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {submitting ? 'Creating…' : 'Create Alert'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Active Alerts</h2>
          <span className="text-xs text-gray-400">Evaluating every 5 min · 30 min window · 30 min cooldown</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No alerts configured</p>
            <p className="text-gray-400 text-xs mt-1">Create an alert to get notified when error rate or latency spikes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Condition</th>
                <th className="px-4 py-2 text-left">Severity</th>
                <th className="px-4 py-2 text-left">Triggered</th>
                <th className="px-4 py-2 text-left">Last Fired</th>
                <th className="px-4 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {alerts.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {COND_LABELS[a.condition_type] ?? a.condition_type} {a.condition_threshold}{COND_UNITS[a.condition_type] ?? ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEV_COLOR[a.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.triggered_count}×</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {a.last_triggered_at ? new Date(a.last_triggered_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
