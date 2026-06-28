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
  latency_p95: 'P95 Latency >',
  latency_avg: 'Avg Latency >',
  cost_per_hour: 'Cost/Hour >',
  throughput_drop: 'Throughput Drop >',
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
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    observability.alerts().then(setAlerts).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !threshold) return
    setSubmitting(true)
    setError('')
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
      setError(err instanceof Error ? err.message : 'Failed to create alert')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this alert?')) return
    await observability.deleteAlert(id)
    load()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Threshold-based notifications for this agent</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Alert
        </button>
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
                    <option key={v} value={v}>{l.replace(' >', '')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Threshold</label>
                <input
                  type="number"
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                  placeholder="e.g. 5"
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
            {error && <p className="text-xs text-red-600">{error}</p>}
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
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Active Alerts</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No alerts configured</p>
            <p className="text-gray-400 text-xs mt-1">Create alerts to get notified when thresholds are breached</p>
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
                    {COND_LABELS[a.condition_type] ?? a.condition_type} {a.condition_threshold}
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
