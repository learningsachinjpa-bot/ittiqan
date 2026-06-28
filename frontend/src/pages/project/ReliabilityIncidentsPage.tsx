import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reliability } from '../../lib/api'
import type { Incident } from '../../lib/api'

const SEV_COLOR: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  investigating: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
}

export default function ReliabilityIncidentsPage() {
  const { id: agentId } = useParams()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [submitting, setSubmitting] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    reliability.incidents().then(setIncidents).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await reliability.createIncident({ title: title.trim(), description: description.trim() || undefined, severity, agent_id: agentId })
      setShowForm(false)
      setTitle('')
      setDescription('')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create incident')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResolve(id: string) {
    setResolving(id)
    try {
      await reliability.resolveIncident(id)
      load()
    } finally {
      setResolving(null)
    }
  }

  const open = incidents.filter(i => i.status !== 'resolved')
  const resolved = incidents.filter(i => i.status === 'resolved')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Incidents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and resolve production incidents</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Report Incident
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open', value: open.length, color: 'text-red-600' },
          { label: 'Critical', value: incidents.filter(i => i.severity === 'critical' && i.status !== 'resolved').length, color: 'text-orange-600' },
          { label: 'Resolved (all time)', value: resolved.length, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{loading ? '…' : value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Report Incident</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="incident-title" className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input
                id="incident-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Agent responses degraded — high latency"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label htmlFor="incident-description" className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                id="incident-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="What's happening? What's the impact?"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
              />
            </div>
            <div>
              <label htmlFor="incident-severity" className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
              <select
                id="incident-severity"
                value={severity}
                onChange={e => setSeverity(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {['low', 'medium', 'high', 'critical'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {submitting ? 'Reporting…' : 'Report'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {[{ title: 'Open Incidents', list: open }, { title: 'Resolved', list: resolved }].map(({ title: sectionTitle, list }) => (
        <div key={sectionTitle} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">{sectionTitle} <span className="text-gray-400 font-normal">({list.length})</span></h2>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No incidents</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {list.map(i => (
                <div key={i.id} className="px-4 py-3 hover:bg-gray-50 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{i.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEV_COLOR[i.severity] ?? ''}`}>{i.severity}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[i.status] ?? ''}`}>{i.status}</span>
                    </div>
                    {i.description && <p className="text-xs text-gray-500 mt-1">{i.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      Opened {new Date(i.created_at).toLocaleString()}
                      {i.resolved_at && ` · Resolved ${new Date(i.resolved_at).toLocaleString()}`}
                    </p>
                  </div>
                  {i.status !== 'resolved' && (
                    <button
                      onClick={() => handleResolve(i.id)}
                      disabled={resolving === i.id}
                      className="text-xs text-green-600 hover:text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
                    >
                      {resolving === i.id ? 'Resolving…' : 'Resolve'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
